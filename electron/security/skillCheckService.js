const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { serialize, deserialize } = require('v8');
const extractZip = require('extract-zip');
const { createSecurityService, worstCoverage } = require('./securityService');
const { POLICY, getBaseLevel } = require('./policyEngine');
const { parseSkillMarkdownMetadata } = require('../skillScanner');
const { isPathInside } = require('../pathUtils');
const { createMutex } = require('./asyncPool');

const emptyState = () => ({ task: null, sourceName: '', files: [], report: null });
const cloneState = (value) => deserialize(serialize(value));
const removeTemp = async (session) => {
  if (session?.tempPath) await fs.rm(session.tempPath, { recursive: true, force: true });
};

// Discover roots without importing anything or consulting the local library.
const findCandidates = async (rootPath) => {
  const candidates = [];
  let entriesSeen = 0;
  const walk = async (directory, depth) => {
    const markdownPath = path.join(directory, 'SKILL.md');
    const stat = await fs.lstat(markdownPath).catch(() => null);
    if (stat?.isFile()) {
      const handle = await fs.open(markdownPath, 'r');
      let markdown;
      try {
        const buffer = Buffer.alloc(Math.min(stat.size, POLICY.limits.sampleBytes));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        markdown = buffer.subarray(0, bytesRead).toString('utf8');
      } finally { await handle.close(); }
      const metadata = parseSkillMarkdownMetadata(markdown);
      candidates.push({
        id: crypto.randomUUID(),
        name: metadata.name || path.basename(directory),
        description: metadata.description || '',
        relativePath: path.relative(rootPath, directory).split(path.sep).join('/'),
        entryPath: directory,
        markdown,
      });
      return;
    }
    if (depth >= POLICY.limits.maxDepth) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (++entriesSeen > POLICY.limits.maxFilesPerSkill) throw new Error('来源文件数量超过扫描限制。');
      if (entry.isDirectory() && !['.git', 'node_modules', '__MACOSX'].includes(entry.name)) {
        await walk(path.join(directory, entry.name), depth + 1);
      }
    }
  };
  await walk(rootPath, 0);
  return candidates.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
};

const createSkillCheckService = ({ tempRoot, emit, ...engineOptions }) => {
  const exclusive = createMutex();
  const sessions = new Map();
  let state = emptyState();
  let currentRun = null;
  const publish = () => emit?.(cloneState(state));

  const discardSession = ({ sessionId } = {}) => exclusive(async () => {
    const session = sessions.get(sessionId);
    sessions.delete(sessionId);
    await removeTemp(session);
  });

  const prepareSource = ({ sourcePath } = {}) => exclusive(async () => {
    if (currentRun && state.task?.status === 'scanning') throw new Error('请先取消当前扫描。');
    if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) throw new Error('请选择有效的文件夹或 ZIP。');
    const sourceStat = await fs.stat(sourcePath).catch(() => null);
    if (!sourceStat) throw new Error('来源不存在或无法读取。');
    for (const session of sessions.values()) await removeTemp(session);
    sessions.clear();
    const session = { id: crypto.randomUUID(), sourcePath, tempPath: null };
    try {
      let rootPath = sourcePath;
      if (sourceStat.isFile() && path.extname(sourcePath).toLowerCase() === '.zip') {
        await fs.mkdir(tempRoot, { recursive: true });
        session.tempPath = await fs.mkdtemp(path.join(tempRoot, 'check-'));
        rootPath = session.tempPath;
        let count = 0;
        let bytes = 0;
        await extractZip(sourcePath, {
          dir: rootPath,
          onEntry(entry) {
            const name = entry.fileName.replace(/\\/g, '/');
            if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')
              || !isPathInside(path.resolve(rootPath, name), rootPath)) throw new Error('ZIP 中包含非法路径。');
            const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
            if (mode === 0o120000) throw new Error('ZIP 中包含符号链接，请展开后选择文件夹扫描。');
            count += 1;
            bytes += entry.uncompressedSize;
            if (count > POLICY.limits.maxFilesPerSkill || bytes > POLICY.limits.maxTotalBytes
              || name.split('/').filter(Boolean).length > POLICY.limits.maxDepth + 1) {
              throw new Error('ZIP 解压内容超过扫描限制。');
            }
          },
        });
      } else if (!sourceStat.isDirectory()) {
        throw new Error('仅支持文件夹和 ZIP 压缩包。');
      }
      session.rootPath = rootPath;
      session.candidates = await findCandidates(rootPath);
      if (!session.candidates.length) throw new Error('未找到 SKILL.md，请选择有效的 Skill。');
      sessions.set(session.id, session);
      return {
        sessionId: session.id,
        candidates: session.candidates.map(({ id, name, relativePath }) => ({ id, name, relativePath })),
      };
    } catch (error) {
      await removeTemp(session);
      throw error;
    }
  });

  const startScan = ({ sessionId, candidateId } = {}) => exclusive(async () => {
    if (currentRun && state.task?.status === 'scanning') throw new Error('扫描正在进行中。');
    if (currentRun) await currentRun.done;
    const session = sessions.get(sessionId);
    const candidate = session?.candidates.find((entry) => entry.id === candidateId);
    if (!session || !candidate) throw new Error('选择已失效，请重新选择 Skill。');
    const realPath = await fs.realpath(candidate.entryPath);
    const rootRealPath = await fs.realpath(session.rootPath);
    if (!isPathInside(realPath, rootRealPath)) throw new Error('Skill 路径超出所选来源。');
    const markdownStat = await fs.lstat(path.join(realPath, 'SKILL.md')).catch(() => null);
    if (!markdownStat?.isFile()) throw new Error('SKILL.md 已变化，请重新选择 Skill。');
    sessions.delete(sessionId);
    const runState = emptyState();
    runState.sourceName = candidate.name;
    state = runState;
    let settle;
    const run = { done: new Promise((resolve) => { settle = resolve; }), service: null };
    currentRun = run;
    const results = new Map();
    let inventory = null;
    const notify = () => { if (state === runState) publish(); };
    const applyReport = (report, completed) => {
      runState.report = report;
      const knownPaths = new Set(runState.files.map((file) => file.path));
      // Directory/link findings also need a selectable entry, even when no file was read.
      for (const finding of report.findings) {
        if (finding.filePath && !knownPaths.has(finding.filePath)) {
          knownPaths.add(finding.filePath);
          runState.files.push({ path: finding.filePath, kind: 'link', status: 'pending' });
        }
      }
      runState.files = runState.files.map((file) => {
        const findings = report.findings.filter((finding) => finding.filePath === file.path);
        const result = results.get(file.path);
        if (!result && !findings.length) return file;
        return {
          path: file.path, kind: file.kind, status: completed ? 'complete' : 'checked',
          level: getBaseLevel(findings),
          coverage: completed ? result?.coverage || 'incomplete' : 'incomplete',
          findings,
        };
      });
    };
    // Only the engine contract is implemented; nothing is persisted or cached across scans.
    const store = {
      saveTask: (task) => { runState.task = publicTask(task); },
      getLatestTask: () => null,
      getFileCache: () => null,
      getSemanticCache: () => null,
      removeMissingReports: () => {},
      saveReport(report) { applyReport({ ...report, id: sessionId }, true); return runState.report; },
    };
    const publicTask = (task) => ({
      id: task.id, status: task.status, phase: task.phase, percent: task.percent,
      processedFiles: task.processedFiles, totalFiles: task.totalFiles,
      currentFile: task.currentFile, findingsCount: task.findingsCount,
      startedAt: task.startedAt, completedAt: task.completedAt, error: task.error,
      semanticAnalysis: runState.report?.semanticAnalysis || null,
    });
    run.service = createSecurityService({
      ...engineOptions, store, progressByFiles: true,
      discoverEntries: async () => [{
        skillId: candidate.id, name: candidate.name, description: candidate.description,
        markdown: await fs.readFile(path.join(realPath, 'SKILL.md'), 'utf8'),
        entryPath: candidate.entryPath, realPath,
        rootIsSymlink: (await fs.lstat(candidate.entryPath)).isSymbolicLink(),
        rootOutsideLibrary: false,
      }],
      onInventory(value) {
        inventory = value;
        runState.files = value.files.map((file) => ({ path: file.relativePath, kind: 'file', status: 'pending' }));
        notify();
      },
      onFileStarted(file) {
        const entry = runState.files.find((item) => item.path === file.relativePath);
        if (entry) entry.status = 'analyzing';
      },
      onFileResult(file, result) {
        results.set(file.relativePath, result);
        const findings = [...(result.deterministicFindings || []), ...(result.instructionFindings || result.findings || [])];
        const index = runState.files.findIndex((entry) => entry.path === file.relativePath);
        if (index >= 0) runState.files[index] = {
          path: file.relativePath, kind: 'file', status: 'checked',
          level: getBaseLevel(findings), coverage: result.coverage, findings,
        };
      },
      emit(event) {
        runState.task = publicTask(event.task);
        if ((event.type === 'canceled' || event.type === 'error') && inventory && !runState.report) {
          const findings = [
            ...inventory.findings,
            ...Array.from(results.values()).flatMap((result) => [
              ...(result.deterministicFindings || []), ...(result.instructionFindings || result.findings || []),
            ]),
          ];
          applyReport({
            id: sessionId, libraryPath: realPath, skillId: candidate.id, name: candidate.name,
            rootPath: candidate.entryPath, baseLevel: getBaseLevel(findings), effectiveLevel: getBaseLevel(findings),
            coverage: worstCoverage(inventory.coverage, 'incomplete'), findingCount: findings.length,
            severityCounts: {}, digest: '', policyVersion: POLICY.version, analyzerVersion: '', scannerVersion: '',
            scannedAt: event.task.completedAt, runId: event.task.id,
            semanticAnalysis: { kind: 'rules', reason: 'no-semantic-corpus' }, semanticAssessments: null, findings,
          }, false);
        }
        notify();
      },
      async onSettled() {
        try { await removeTemp(session); } finally { settle(); }
      },
    });
    try {
      await run.service.startScan({ installPath: realPath, mode: 'full' });
      return cloneState(runState);
    } catch (error) {
      currentRun = null;
      await removeTemp(session);
      settle();
      throw error;
    }
  });

  const cancelScan = async ({ taskId } = {}) => {
    if (!currentRun || taskId !== state.task?.id) return { ok: false, reason: 'not-running' };
    return currentRun.service.cancelScan({ taskId });
  };
  const reset = () => exclusive(async () => {
    const run = currentRun;
    const taskId = state.task?.id;
    state = emptyState();
    publish();
    if (run) {
      await run.service.cancelScan({ taskId });
      await run.done;
    }
    currentRun = null;
    for (const session of sessions.values()) await removeTemp(session);
    sessions.clear();
  });
  return {
    prepareSource, startScan, discardSession, cancelScan, reset,
    getState: () => cloneState(state),
    isModelBusy: () => currentRun?.service.isModelBusy() || false,
  };
};

module.exports = { createSkillCheckService };
