const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { collectSkillInventory, discoverSkillEntries } = require('./inventoryCollector');
const {
  ANALYZER_VERSION,
  POLICY_VERSION,
  SCANNER_VERSION,
  aggregateFindings,
  getBaseLevel,
  getEffectiveLevel,
  normalizeFinding,
} = require('./policyEngine');
const {
  SEMANTIC_MODEL_ID,
  SEMANTIC_POLICY_VERSION,
  SEMANTIC_PROMPT_VERSION,
  SEMANTIC_SCHEMA_VERSION,
  assessmentsToFindings,
  createSemanticCacheKey,
  parseSemanticAssessments,
} = require('./semanticPolicy');
const { detectHostCapabilities, resolveCapabilities } = require('./hostCapabilities');
const { splitSemanticDocuments } = require('./semanticChunker');
const { createLimiter, createMutex, mapPool } = require('./asyncPool');

const COVERAGE_RANK = { complete: 0, partial: 1, incomplete: 2 };
const MAX_EVENT_RATE_MS = 100;

const worstCoverage = (...values) => values.reduce((worst, value) => (
  (COVERAGE_RANK[value] ?? 0) > (COVERAGE_RANK[worst] ?? 0) ? value : worst
), 'complete');

const getWorkUnits = (size) => 1 + Math.min(Math.ceil((Number(size) || 0) / 65536), 16);

class WorkerPool {
  constructor(workerPath, size) {
    this.workerPath = workerPath;
    this.size = size;
    this.workers = [];
    this.queue = [];
    this.closed = false;
    this.sequence = 0;
    for (let index = 0; index < size; index += 1) this.addWorker();
  }

  addWorker() {
    const worker = new Worker(this.workerPath);
    const state = { worker, current: null };
    worker.on('message', (message) => {
      const current = state.current;
      if (!current || message.id !== current.id) return;
      state.current = null;
      if (message.type === 'result') current.resolve(message.result);
      else current.reject(new Error(message.error || 'security-worker-failed'));
      this.dispatch();
    });
    worker.on('error', (error) => {
      if (state.current) {
        state.current.reject(error);
        state.current = null;
      }
      if (!this.closed) {
        this.workers = this.workers.filter((entry) => entry !== state);
        this.addWorker();
        this.dispatch();
      }
    });
    worker.on('exit', (code) => {
      if (state.current) {
        state.current.reject(new Error(`security-worker-exited:${code}`));
        state.current = null;
      }
      this.workers = this.workers.filter((entry) => entry !== state);
    });
    this.workers.push(state);
  }

  run(job, onStart) {
    if (this.closed) return Promise.reject(new Error('security-worker-pool-closed'));
    return new Promise((resolve, reject) => {
      this.sequence += 1;
      this.queue.push({ id: this.sequence, job, onStart, resolve, reject });
      this.dispatch();
    });
  }

  dispatch() {
    if (this.closed) return;
    for (const state of this.workers) {
      if (state.current || !this.queue.length) continue;
      const next = this.queue.shift();
      state.current = next;
      next.onStart?.();
      state.worker.postMessage({ type: 'analyze', id: next.id, job: next.job });
    }
  }

  async close(reason = 'security-worker-pool-closed') {
    if (this.closed) return;
    this.closed = true;
    const error = new Error(reason);
    this.queue.splice(0).forEach((entry) => entry.reject(error));
    this.workers.forEach((state) => {
      if (state.current) {
        state.current.reject(error);
        state.current = null;
      }
    });
    await Promise.allSettled(this.workers.map((state) => state.worker.terminate()));
    this.workers = [];
  }
}

const fileFailureResult = (file, error) => ({
  filePath: file.relativePath,
  size: file.size,
  mtimeMs: file.mtimeMs,
  digest: '',
  coverage: 'incomplete',
  findings: [normalizeFinding({
    ruleId: 'FILE_SCAN_FAILED',
    title: '文件扫描失败',
    category: 'scan-coverage',
    severity: 'low',
    confidence: 'high',
    filePath: file.relativePath,
    evidence: String(error?.message || error || '未知错误'),
    message: '文件无法完成读取或分析，扫描结果不完整。',
    remediation: '检查文件权限和文件状态后重新扫描。',
  })],
});

const createSecurityService = ({
  store,
  workerPath,
  emit,
  modelService,
  inferenceService,
  hostCapabilities,
}) => {
  const capabilities = resolveCapabilities(hostCapabilities || detectHostCapabilities());
  const activeTasks = new Map();
  const tasksById = new Map();

  const publicTask = (task) => ({
    id: task.id,
    libraryPath: task.libraryPath,
    mode: task.mode,
    status: task.status,
    phase: task.phase,
    percent: Math.max(0, Math.min(100, Math.round(task.percent || 0))),
    currentSkillId: task.currentSkillId || '',
    currentSkillName: task.currentSkillName || '',
    currentFile: task.currentFile || '',
    activeSkillIds: [...(task.activeSkillIds || [])],
    semanticChunkIndex: task.semanticChunkIndex || 0,
    semanticChunkCount: task.semanticChunkCount || 0,
    semanticCompletedChunks: task.semanticCompletedChunks || 0,
    semanticTotalChunks: task.semanticTotalChunks || 0,
    semanticInFlightChunks: task.semanticInFlightChunks || 0,
    processedFiles: task.processedFiles || 0,
    totalFiles: task.totalFiles || 0,
    completedSkills: task.completedSkills || 0,
    totalSkills: task.totalSkills || 0,
    findingsCount: task.findingsCount || 0,
    startedAt: task.startedAt,
    completedAt: task.completedAt || null,
    error: task.error || null,
    runtime: task.runtime || {
      sequences: capabilities.sequences,
      fileWorkers: capabilities.fileWorkers,
      batchSize: capabilities.batchSize,
    },
  });

  const emitEvent = (event) => emit?.(event);
  const persistTask = (task) => store.saveTask(publicTask(task));

  const emitProgress = (task, force = false) => {
    const now = Date.now();
    if (!force && now - (task.lastEventAt || 0) < MAX_EVENT_RATE_MS) return;
    task.lastEventAt = now;
    emitEvent({ type: 'progress', task: publicTask(task) });
  };

  const updateAnalysisProgress = (task, force = false) => {
    const fileRatio = task.totalWorkUnits
      ? task.processedWorkUnits / task.totalWorkUnits
      : task.totalFiles ? task.processedFiles / task.totalFiles : 1;
    const registered = task.semanticRegisteredSkills || 0;
    const estimatedChunks = Math.max(
      (task.semanticTotalChunks || 0) + Math.max(0, (task.totalSkills || 0) - registered),
      1,
    );
    const chunkRatio = Math.min(1, (
      (task.semanticCompletedChunks || 0) + (task.semanticInFlightChunks || 0) * 0.35
    ) / estimatedChunks);
    task.percent = 10 + Math.min(1, fileRatio) * 25 + chunkRatio * 62;
    if (task.semanticInFlight > 0) task.phase = 'semantic';
    else if (task.analyzingInFlight > 0) task.phase = 'analyzing';
    emitProgress(task, force);
  };

  const markFileProcessed = (task, file) => {
    task.processedFiles += 1;
    task.processedWorkUnits += getWorkUnits(file.size);
    updateAnalysisProgress(task);
  };

  const createReport = ({ task, inventory, fileResults, semantic }) => {
    const fileDigests = new Map(fileResults.map((result) => [result.filePath, result.digest]));
    const fileFindings = semantic.analysis.kind === 'model'
      ? [
          ...fileResults.flatMap((result) => result.deterministicFindings || result.findings || []),
          ...assessmentsToFindings(semantic.assessments),
        ]
      : fileResults.flatMap((result) => [
          ...(result.deterministicFindings || []),
          ...(result.instructionFindings || result.findings || []),
        ]);
    const findings = aggregateFindings([
      ...inventory.findings.map((finding) => ({ ...finding, fileDigest: '' })),
      ...fileFindings.map((finding) => ({
        ...finding,
        fileDigest: finding.fileDigest || fileDigests.get(finding.filePath) || '',
      })),
    ]).map((finding) => normalizeFinding({
      ...finding,
      fileDigest: finding.fileDigest || fileDigests.get(finding.filePath) || '',
      policyVersion: POLICY_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      scannerVersion: SCANNER_VERSION,
    }));
    const coverage = worstCoverage(
      inventory.coverage,
      ...fileResults.map((result) => result.coverage),
    );
    const baseLevel = getBaseLevel(findings);
    const severityCounts = findings.reduce((counts, finding) => {
      counts[finding.severity] = (counts[finding.severity] || 0) + 1;
      return counts;
    }, {});
    const digest = crypto.createHash('sha256').update(
      inventory.files
        .map((file) => {
          const result = fileResults.find((entry) => entry.filePath === file.relativePath);
          return `${file.relativePath}\0${file.size}\0${file.mtimeMs}\0${result?.digest || ''}`;
        })
        .sort()
        .join('\n'),
    ).digest('hex');
    const scannedAt = new Date().toISOString();
    return {
      libraryPath: task.libraryPath,
      skillId: inventory.skillId,
      name: inventory.name,
      rootPath: inventory.entryPath,
      baseLevel,
      effectiveLevel: getEffectiveLevel(baseLevel, coverage),
      coverage,
      findingCount: findings.length,
      severityCounts,
      digest,
      policyVersion: POLICY_VERSION,
      analyzerVersion: ANALYZER_VERSION,
      scannerVersion: SCANNER_VERSION,
      scannedAt,
      runId: task.id,
      semanticAnalysis: semantic.analysis,
      semanticAssessments: semantic.analysis.kind === 'model' ? semantic.assessments : null,
      findings,
    };
  };

  const analyzeInventory = async (task, inventory, pool) => {
    const fileResults = [];
    const analysisFiles = [];
    for (const file of inventory.files) {
      if (task.cancelRequested) throw new Error('security-scan-canceled');
      const cached = task.mode === 'incremental'
        ? store.getFileCache(task.libraryPath, inventory.skillId, file.relativePath)
        : null;
      const reusableCache = (
        cached &&
        cached.size === file.size &&
        cached.mtimeMs === file.mtimeMs &&
        cached.policyVersion === POLICY_VERSION &&
        cached.analyzerVersion === ANALYZER_VERSION
      ) ? cached : null;
      analysisFiles.push({
        file,
        cached: reusableCache,
        metadataOnly: file.kind === 'static' || file.kind === 'archive' || file.kind === 'executable',
        metadataCoverage: file.kind === 'executable'
          ? 'incomplete'
          : file.kind === 'archive' ? 'partial' : 'complete',
      });
    }

    const analyzed = await Promise.all(analysisFiles.map(({
      file,
      cached,
      metadataOnly,
      metadataCoverage,
    }) => pool.run({
      rootPath: inventory.realPath,
      file,
      cached,
      metadataOnly,
      metadataCoverage,
    }, () => {
      task.currentSkillId = inventory.skillId;
      task.currentSkillName = inventory.name;
      task.currentFile = file.relativePath;
      emitProgress(task);
    }).catch((error) => {
      if (task.cancelRequested) throw error;
      return fileFailureResult(file, error);
    }).then((result) => {
      if (task.cancelRequested) throw new Error('security-scan-canceled');
      markFileProcessed(task, file);
      return result;
    })));
    fileResults.push(...analyzed);
    return fileResults;
  };

  const noteSemanticSkipped = (task) => {
    task.semanticRegisteredSkills += 1;
    task.semanticTotalChunks += 1;
    task.semanticCompletedChunks += 1;
    updateAnalysisProgress(task, true);
  };

  const analyzeSemantics = async (task, inventory, fileResults) => {
    if (task.modelSnapshot.kind === 'missing') {
      noteSemanticSkipped(task);
      return {
        analysis: { kind: 'rules', reason: 'model-missing' },
        assessments: null,
        cache: null,
      };
    }
    if (task.modelSnapshot.kind !== 'ready' || !inferenceService) {
      noteSemanticSkipped(task);
      return {
        analysis: { kind: 'fallback', reason: 'model-invalid' },
        assessments: null,
        cache: null,
      };
    }

    const inventoryFiles = new Map(inventory.files.map((file) => [file.relativePath, file]));
    const semanticResults = fileResults.filter((result) => result.semanticEligible);
    if (!semanticResults.length) {
      noteSemanticSkipped(task);
      return {
        analysis: { kind: 'rules', reason: 'no-semantic-corpus' },
        assessments: null,
        cache: null,
      };
    }

    const corpusDigest = crypto.createHash('sha256').update(
      semanticResults
        .map((result) => `${result.filePath}\0${result.digest}`)
        .sort()
        .join('\n'),
    ).digest('hex');
    const cacheKey = createSemanticCacheKey({
      corpusDigest,
      modelSha256: task.modelSnapshot.modelSha256,
      promptVersion: task.semanticPolicy.promptVersion,
      schemaVersion: task.semanticPolicy.schemaVersion,
      policyVersion: task.semanticPolicy.policyVersion,
    });
    if (task.mode === 'incremental') {
      const cached = store.getSemanticCache?.(
        task.libraryPath,
        inventory.skillId,
        cacheKey,
      );
      if (cached?.assessments) {
        const parsed = parseSemanticAssessments(cached.assessments);
        if (parsed.ok) {
          noteSemanticSkipped(task);
          return {
            analysis: {
              kind: 'model',
              modelId: SEMANTIC_MODEL_ID,
              modelSha256: task.modelSnapshot.modelSha256,
              policyVersion: task.semanticPolicy.policyVersion,
            },
            assessments: parsed.assessments,
            cache: null,
          };
        }
      }
    }

    const maxCorpusBytes = capabilities.documentTokenBudget * capabilities.maxChunks * 2;
    const totalBytes = semanticResults.reduce((sum, result) => {
      const file = inventoryFiles.get(result.filePath);
      return sum + (file?.size || 0);
    }, 0);
    if (totalBytes > maxCorpusBytes) {
      noteSemanticSkipped(task);
      return {
        analysis: { kind: 'fallback', reason: 'corpus-too-large' },
        assessments: null,
        cache: null,
      };
    }

    const documents = [];
    const skipChanged = () => {
      noteSemanticSkipped(task);
      return {
        analysis: { kind: 'fallback', reason: 'corpus-changed' },
        assessments: null,
        cache: null,
      };
    };
    try {
      for (const result of semanticResults) {
        if (task.cancelRequested) throw new Error('security-scan-canceled');
        const file = inventoryFiles.get(result.filePath);
        if (!file) return skipChanged();
        if (typeof result.textContent === 'string') {
          const digest = crypto.createHash('sha256').update(result.textContent).digest('hex');
          if (digest !== result.digest) return skipChanged();
          documents.push({ filePath: result.filePath, content: result.textContent });
          continue;
        }
        const content = await fs.readFile(file.fullPath);
        const digest = crypto.createHash('sha256').update(content).digest('hex');
        if (digest !== result.digest) return skipChanged();
        documents.push({ filePath: result.filePath, content: content.toString('utf8') });
      }
    } catch (error) {
      if (task.cancelRequested) throw error;
      return skipChanged();
    }

    const chunks = splitSemanticDocuments(documents, capabilities);
    if (!chunks) {
      noteSemanticSkipped(task);
      return {
        analysis: { kind: 'fallback', reason: 'corpus-too-large' },
        assessments: null,
        cache: null,
      };
    }

    const reservedChunks = Math.max(chunks.length, 1);
    task.currentSkillId = inventory.skillId;
    task.currentSkillName = inventory.name;
    task.currentFile = '';
    task.semanticRegisteredSkills += 1;
    task.semanticTotalChunks += reservedChunks;
    task.semanticInFlightChunks += 1;
    task.semanticChunkIndex = 0;
    task.semanticChunkCount = chunks.length;
    updateAnalysisProgress(task, true);

    let completedForSkill = 0;
    let result;
    try {
      result = await inferenceService.analyze({
        modelSnapshot: task.modelSnapshot,
        skillName: inventory.name,
        description: inventory.description || '',
        documents,
        signal: task.abortController.signal,
        onChunk: ({ index, count, done }) => {
          task.semanticChunkIndex = index;
          task.semanticChunkCount = count;
          if (done) {
            completedForSkill += 1;
            task.semanticCompletedChunks += 1;
          }
          updateAnalysisProgress(task, true);
        },
      });
    } finally {
      const remaining = reservedChunks - completedForSkill;
      if (remaining > 0) task.semanticCompletedChunks += remaining;
      task.semanticInFlightChunks = Math.max(0, task.semanticInFlightChunks - 1);
      updateAnalysisProgress(task, true);
    }
    if (result.diagnostics) {
      task.runtime = {
        ...task.runtime,
        gpuLayers: result.diagnostics.gpuLayers ?? task.runtime.gpuLayers,
        sequences: result.diagnostics.sequences || task.runtime.sequences,
        batchSize: result.diagnostics.batchSize || task.runtime.batchSize,
      };
    }
    if (task.cancelRequested) throw new Error('security-scan-canceled');
    if (!result.ok) {
      return {
        analysis: { kind: 'fallback', reason: result.reason },
        assessments: null,
        cache: null,
      };
    }
    const cache = {
      cacheKey,
      corpusDigest,
      modelSha256: task.modelSnapshot.modelSha256,
      promptVersion: task.semanticPolicy.promptVersion,
      schemaVersion: task.semanticPolicy.schemaVersion,
      semanticPolicyVersion: task.semanticPolicy.policyVersion,
      assessments: result.assessments,
    };
    return {
      analysis: {
        kind: 'model',
        modelId: SEMANTIC_MODEL_ID,
        modelSha256: task.modelSnapshot.modelSha256,
        policyVersion: task.semanticPolicy.policyVersion,
      },
      assessments: result.assessments,
      cache,
    };
  };

  const trackSkill = (task, inventory, active) => {
    if (active) {
      if (!task.activeSkillIds.includes(inventory.skillId)) {
        task.activeSkillIds.push(inventory.skillId);
      }
      task.currentSkillId = inventory.skillId;
      task.currentSkillName = inventory.name;
      return;
    }
    task.activeSkillIds = task.activeSkillIds.filter((skillId) => skillId !== inventory.skillId);
    if (task.currentSkillId === inventory.skillId) {
      task.currentSkillId = task.activeSkillIds[0] || '';
      task.currentSkillName = '';
    }
  };

  const runScan = async (task) => {
    let pool = null;
    const saveLock = createMutex();
    const semanticLimiter = createLimiter(2);
    try {
      const rootStat = await fs.stat(task.libraryPath);
      if (!rootStat.isDirectory()) throw new Error('统一技能库路径不是目录。');
      task.phase = 'inventory';
      task.status = 'scanning';
      task.percent = 0;
      emitProgress(task, true);
      const skillEntries = await discoverSkillEntries(task.libraryPath);
      task.totalSkills = skillEntries.length;
      let inventoried = 0;
      const inventories = await mapPool(
        skillEntries,
        capabilities.inventoryConcurrency,
        async (skill) => {
          if (task.cancelRequested) throw new Error('security-scan-canceled');
          task.currentSkillId = skill.skillId;
          task.currentSkillName = skill.name;
          task.currentFile = '';
          const inventory = await collectSkillInventory(skill, {
            onFile: (_targetSkill, file) => {
              task.currentFile = file.relativePath;
              emitProgress(task);
            },
          });
          inventoried += 1;
          task.percent = skillEntries.length ? (inventoried / skillEntries.length) * 10 : 10;
          emitProgress(task);
          return inventory;
        },
      );
      if (task.cancelRequested) throw new Error('security-scan-canceled');
      task.totalFiles = inventories.reduce((sum, inventory) => sum + inventory.files.length, 0);
      task.totalWorkUnits = inventories.reduce(
        (sum, inventory) => sum + inventory.files.reduce(
          (fileSum, file) => fileSum + getWorkUnits(file.size),
          0,
        ),
        0,
      );
      task.phase = 'analyzing';
      task.percent = 10;
      emitProgress(task, true);

      pool = new WorkerPool(workerPath, capabilities.fileWorkers);
      task.pool = pool;
      await Promise.all(inventories.map(async (inventory) => {
        if (task.cancelRequested) throw new Error('security-scan-canceled');
        trackSkill(task, inventory, true);
        emitProgress(task);
        try {
          task.analyzingInFlight += 1;
          updateAnalysisProgress(task);
          const fileResults = await analyzeInventory(task, inventory, pool);
          if (task.cancelRequested) throw new Error('security-scan-canceled');
          await semanticLimiter.acquire();
          if (task.cancelRequested) {
            semanticLimiter.release();
            throw new Error('security-scan-canceled');
          }
          task.semanticInFlight += 1;
          updateAnalysisProgress(task);
          try {
            const semantic = await analyzeSemantics(task, inventory, fileResults);
            const report = createReport({ task, inventory, fileResults, semantic });
            await saveLock(async () => {
              if (task.cancelRequested) throw new Error('security-scan-canceled');
              const savedReport = await store.saveReport(report, fileResults, semantic.cache);
              task.completedSkills += 1;
              task.findingsCount += report.findingCount;
              updateAnalysisProgress(task);
              await persistTask(task);
              const {
                findings: _findings,
                semanticAssessments: _semanticAssessments,
                ...reportSummary
              } = savedReport;
              emitEvent({
                type: 'report-updated',
                report: reportSummary,
                task: publicTask(task),
              });
            });
          } finally {
            task.semanticInFlight = Math.max(0, task.semanticInFlight - 1);
            semanticLimiter.release();
          }
        } finally {
          task.analyzingInFlight = Math.max(0, task.analyzingInFlight - 1);
          trackSkill(task, inventory, false);
        }
      }));

      task.phase = 'finalizing';
      task.percent = 97;
      task.currentFile = '';
      task.activeSkillIds = [];
      emitProgress(task, true);
      await store.removeMissingReports(
        task.libraryPath,
        inventories.map((inventory) => inventory.skillId),
      );
      task.status = 'completed';
      task.phase = 'completed';
      task.percent = 100;
      task.completedAt = new Date().toISOString();
      task.currentSkillId = '';
      task.currentSkillName = '';
      await persistTask(task);
      activeTasks.delete(task.libraryPath);
      emitEvent({ type: 'completed', task: publicTask(task) });
    } catch (error) {
      const canceled = task.cancelRequested || error?.message === 'security-scan-canceled';
      task.status = canceled ? 'canceled' : 'error';
      task.phase = canceled ? 'canceled' : 'error';
      task.completedAt = new Date().toISOString();
      task.error = canceled ? null : String(error?.message || error);
      await persistTask(task).catch(() => {});
      activeTasks.delete(task.libraryPath);
      emitEvent({
        type: canceled ? 'canceled' : 'error',
        task: publicTask(task),
        error: task.error,
      });
    } finally {
      if (pool) await pool.close().catch(() => {});
      task.pool = null;
      activeTasks.delete(task.libraryPath);
      tasksById.delete(task.id);
    }
  };

  const startScan = async ({ installPath, mode = 'incremental' } = {}) => {
    const rawInstallPath = String(installPath || '').trim();
    if (!rawInstallPath) throw new Error('统一技能库路径不能为空。');
    const libraryPath = path.normalize(rawInstallPath);
    const active = activeTasks.get(libraryPath);
    if (active?.status === 'scanning') return publicTask(active);
    if (active) activeTasks.delete(libraryPath);
    const modelSnapshot = modelService
      ? await modelService.getSnapshot()
      : { kind: 'missing' };
    const task = {
      id: crypto.randomUUID(),
      libraryPath,
      mode: mode === 'full' ? 'full' : 'incremental',
      status: 'scanning',
      phase: 'inventory',
      percent: 0,
      processedFiles: 0,
      totalFiles: 0,
      completedSkills: 0,
      totalSkills: 0,
      findingsCount: 0,
      processedWorkUnits: 0,
      totalWorkUnits: 0,
      currentSkillId: '',
      currentSkillName: '',
      currentFile: '',
      activeSkillIds: [],
      semanticChunkIndex: 0,
      semanticChunkCount: 0,
      semanticCompletedChunks: 0,
      semanticTotalChunks: 0,
      semanticInFlightChunks: 0,
      semanticRegisteredSkills: 0,
      analyzingInFlight: 0,
      semanticInFlight: 0,
      runtime: {
        sequences: capabilities.sequences,
        fileWorkers: capabilities.fileWorkers,
        batchSize: capabilities.batchSize,
      },
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      cancelRequested: false,
      lastEventAt: 0,
      pool: null,
      abortController: new AbortController(),
      modelSnapshot,
      semanticPolicy: {
        policyVersion: SEMANTIC_POLICY_VERSION,
        promptVersion: SEMANTIC_PROMPT_VERSION,
        schemaVersion: SEMANTIC_SCHEMA_VERSION,
      },
    };
    activeTasks.set(libraryPath, task);
    tasksById.set(task.id, task);
    await persistTask(task);
    void runScan(task);
    return publicTask(task);
  };

  const cancelScan = async ({ taskId } = {}) => {
    const task = tasksById.get(taskId);
    if (!task || task.status !== 'scanning') return { ok: false, reason: 'not-running' };
    task.cancelRequested = true;
    task.abortController.abort(new Error('security-scan-canceled'));
    if (task.pool) await task.pool.close('security-scan-canceled').catch(() => {});
    return { ok: true };
  };

  const getScanState = ({ installPath } = {}) => {
    const libraryPath = path.normalize(String(installPath || ''));
    const active = activeTasks.get(libraryPath);
    if (active) return publicTask(active);
    const latest = store.getLatestTask(libraryPath);
    if (!latest) return null;
    if (latest.status === 'scanning') {
      return {
        ...latest,
        status: 'error',
        phase: 'error',
        error: '上次扫描在应用退出前未正常完成。',
      };
    }
    return latest;
  };

  return {
    cancelScan,
    getReport: ({ installPath, skillId }) => store.getReport(path.normalize(String(installPath || '')), String(skillId || '')),
    getScanState,
    listReports: ({ installPath }) => store.listReports(path.normalize(String(installPath || ''))),
    isModelBusy: () => Array.from(activeTasks.values()).some((task) => (
      task.status === 'scanning' && task.modelSnapshot?.kind === 'ready'
    )),
    startScan,
  };
};

module.exports = {
  createSecurityService,
  getWorkUnits,
  worstCoverage,
};
