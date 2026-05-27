const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { execFile } = require('child_process');
const extractZip = require('extract-zip');
const {
  ensureDir,
  isPathInside,
  pathExists,
  removeIfExists,
} = require('./pathUtils');
const {
  hasSkillMarkdown,
  loadSkillsFromPath,
  parseSkillMarkdownMetadata,
  readSkillFromDir,
} = require('./skillScanner');

const IMPORT_SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SKILL_SCAN_DEPTH = 3;
const SKIPPED_DIRS = new Set(['.git', 'node_modules']);
const importSessions = new Map();

const createId = () => crypto.randomBytes(8).toString('hex');

const slugify = (value, fallback = 'imported-skill') => {
  const slug = String(value || '')
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\.zip$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
};

const getSafeTargetPath = (rootPath, relativePath) => {
  const targetPath = path.normalize(path.join(rootPath, relativePath || ''));
  if (!isPathInside(targetPath, rootPath)) {
    throw new Error('invalid-path');
  }
  return targetPath;
};

const getRepoNameFromUrl = (url) => {
  const trimmed = String(url || '').trim();
  const sshMatch = trimmed.match(/[:/]([^/:]+?)(?:\.git)?$/);
  if (sshMatch) return slugify(sshMatch[1], 'repo');
  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return slugify(segments[1] || segments[0], 'repo');
  } catch (error) {
    return 'repo';
  }
};

const parseGithubTreeUrl = (url) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, '');
    const treeIndex = segments.indexOf('tree');
    const subpath = treeIndex >= 0 && segments.length > treeIndex + 2
      ? segments.slice(treeIndex + 2).join('/')
      : '';
    return {
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      repoName: repo,
      subpath,
    };
  } catch (error) {
    return null;
  }
};

const normalizeGitSource = (input) => {
  const value = String(input || '').trim();
  if (!value) return null;

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.~/-]+)?$/.test(value)) {
    const [owner, repo, ...rest] = value.split('/');
    return {
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      repoName: repo,
      subpath: rest.join('/'),
    };
  }

  const githubTree = parseGithubTreeUrl(value);
  if (githubTree) return githubTree;

  if (
    /^https:\/\/[^\s]+$/i.test(value) ||
    /^ssh:\/\/[^\s]+$/i.test(value) ||
    /^git@[A-Za-z0-9_.-]+:[A-Za-z0-9_.~/-]+(?:\.git)?$/i.test(value)
  ) {
    return {
      cloneUrl: value,
      repoName: getRepoNameFromUrl(value),
      subpath: '',
    };
  }

  return null;
};

const execFileAsync = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const createImportRoot = async (tempRoot, prefix) => {
  const root = path.join(tempRoot, `${slugify(prefix, 'source')}-${Date.now()}-${createId()}`);
  await ensureDir(root);
  return root;
};

const readCandidateMetadata = async (skillDir) => {
  const content = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf-8').catch(() => '');
  return parseSkillMarkdownMetadata(content);
};

const normalizeSkillName = (value) => String(value || '').trim().toLowerCase();

const loadConflictIndex = async (installPath) => {
  if (!installPath || !await pathExists(installPath)) {
    return {
      existingIds: new Set(),
      skillIdByName: new Map(),
    };
  }
  const skills = await loadSkillsFromPath(installPath, { mode: 'library' }).catch(() => []);
  const entries = await fs.readdir(installPath, { withFileTypes: true }).catch(() => []);
  const existingDirs = entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => entry.name);
  return {
    existingIds: new Set([...skills.map((skill) => skill.id), ...existingDirs]),
    skillIdByName: new Map(
      skills
        .map((skill) => [normalizeSkillName(skill.name), skill.id])
        .filter(([name]) => Boolean(name)),
    ),
  };
};

const buildCandidate = async ({ rootPath, skillDir, preferredId, conflictIndex }) => {
  const relativePath = path.relative(rootPath, skillDir).split(path.sep).join('/');
  const metadata = await readCandidateMetadata(skillDir);
  const directoryName = path.basename(skillDir);
  const skillId = slugify(
    relativePath ? directoryName : preferredId || metadata.name || directoryName,
  );
  const name = metadata.name || skillId;
  const existingSkillId = conflictIndex?.skillIdByName.get(normalizeSkillName(name));
  const idConflict = Boolean(conflictIndex?.existingIds.has(skillId));
  const nameConflict = Boolean(existingSkillId);
  return {
    id: `${relativePath || '.'}::${skillId}`,
    skillId,
    name,
    description: metadata.description || '未提供描述。',
    version: metadata.version || '0.1.0',
    relativePath,
    idConflict,
    nameConflict,
    existingSkillId: existingSkillId || (idConflict ? skillId : null),
  };
};

const walkSkillCandidates = async ({
  rootPath,
  currentPath,
  preferredId,
  results,
  conflictIndex,
  depth,
}) => {
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
  if (await hasSkillMarkdown(currentPath)) {
    results.push(await buildCandidate({
      rootPath,
      skillDir: currentPath,
      preferredId,
      conflictIndex,
    }));
    return;
  }

  if (depth >= MAX_SKILL_SCAN_DEPTH) return;
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
    if (entry.isSymbolicLink()) continue;
    await walkSkillCandidates({
      rootPath,
      currentPath: path.join(currentPath, entry.name),
      preferredId,
      results,
      conflictIndex,
      depth: depth + 1,
    });
  }
};

const scanImportCandidates = async ({ rootPath, preferredId, installPath }) => {
  if (!rootPath || !await pathExists(rootPath)) {
    return { ok: false, reason: 'source-missing', candidates: [] };
  }
  const results = [];
  const conflictIndex = await loadConflictIndex(installPath);
  await walkSkillCandidates({
    rootPath,
    currentPath: rootPath,
    preferredId,
    results,
    conflictIndex,
    depth: 0,
  });
  return {
    ok: true,
    candidates: results.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
  };
};

const importCandidateToLibrary = async ({ installPath, rootPath, candidate }) => {
  if (!installPath || !candidate?.skillId) {
    return { ok: false, reason: 'invalid' };
  }
  await ensureDir(installPath);
  const sourceDir = getSafeTargetPath(rootPath, candidate.relativePath);
  if (!await hasSkillMarkdown(sourceDir)) {
    return { ok: false, reason: 'invalid-skill' };
  }

  const targetDir = path.join(installPath, candidate.skillId);
  if (await pathExists(targetDir)) {
    if (!await hasSkillMarkdown(targetDir)) {
      return { ok: false, reason: 'exists' };
    }
    const existingSkill = await readSkillFromDir(targetDir, candidate.skillId, {
      source: 'library',
    });
    return { ok: true, skill: existingSkill, reused: true };
  }

  const tempDir = path.join(
    installPath,
    `.${candidate.skillId}.${process.pid}.${Date.now()}.tmp`,
  );
  await removeIfExists(tempDir);
  await fs.cp(sourceDir, tempDir, { recursive: true, force: true });
  if (!await hasSkillMarkdown(tempDir)) {
    await removeIfExists(tempDir);
    return { ok: false, reason: 'invalid-skill' };
  }
  await fs.rename(tempDir, targetDir);
  const skill = await readSkillFromDir(targetDir, candidate.skillId, {
    source: 'library',
  });
  return { ok: true, skill, reused: false };
};

const importCandidatesToLibrary = async ({ installPath, rootPath, candidates }) => {
  const skills = [];
  const reusedSkillIds = [];
  const failedCandidates = [];

  for (const candidate of candidates) {
    const result = await importCandidateToLibrary({ installPath, rootPath, candidate });
    if (result.ok) {
      if (result.skill) skills.push(result.skill);
      if (result.reused && result.skill?.id) reusedSkillIds.push(result.skill.id);
      continue;
    }
    failedCandidates.push({
      candidateId: candidate.id,
      skillId: candidate.skillId,
      reason: result.reason || 'import-failed',
    });
  }

  if (!skills.length) {
    return {
      ok: false,
      reason: failedCandidates[0]?.reason || 'import-failed',
      failedCandidates,
    };
  }

  return {
    ok: true,
    skill: skills[0],
    skills,
    reused: reusedSkillIds.length === skills.length,
    reusedSkillIds,
    failedCandidates,
  };
};

const storeSession = ({ rootPath, candidates }) => {
  const sessionId = createId();
  importSessions.set(sessionId, {
    rootPath,
    candidates,
    createdAt: Date.now(),
  });
  return sessionId;
};

const pruneSessions = () => {
  const now = Date.now();
  for (const [sessionId, session] of importSessions.entries()) {
    if (now - session.createdAt > IMPORT_SESSION_TTL_MS) {
      importSessions.delete(sessionId);
      void removeIfExists(session.rootPath);
    }
  }
};

const resolveSingleOrSelection = async ({
  installPath,
  rootPath,
  candidates,
  preferredSkillId,
}) => {
  if (!candidates.length) {
    return { ok: false, reason: 'no-skill-found' };
  }

  const preferredCandidate = preferredSkillId
    ? candidates.find((candidate) =>
        candidate.skillId === preferredSkillId ||
        candidate.relativePath.split('/').pop() === preferredSkillId)
    : null;
  const targetCandidates = preferredCandidate ? [preferredCandidate] : candidates;

  if (targetCandidates.length === 1) {
    return importCandidateToLibrary({
      installPath,
      rootPath,
      candidate: targetCandidates[0],
    });
  }

  const sessionId = storeSession({ rootPath, candidates: targetCandidates });
  return {
    ok: false,
    reason: 'multiple-candidates',
    sessionId,
    candidates: targetCandidates,
  };
};

const importFromZip = async ({ zipPath, installPath, tempRoot }) => {
  if (!zipPath || !await pathExists(zipPath)) {
    return { ok: false, reason: 'source-missing' };
  }
  const rootPath = await createImportRoot(tempRoot, path.basename(zipPath));
  try {
    await extractZip(zipPath, { dir: rootPath });
  } catch (error) {
    return { ok: false, reason: 'extract-failed' };
  }
  const scan = await scanImportCandidates({
    rootPath,
    preferredId: path.basename(zipPath),
    installPath,
  });
  if (!scan.ok) return scan;
  return resolveSingleOrSelection({
    installPath,
    rootPath,
    candidates: scan.candidates,
  });
};

const importFromGit = async ({ url, installPath, tempRoot, preferredSkillId }) => {
  const source = normalizeGitSource(url);
  if (!source) return { ok: false, reason: 'invalid-git-url' };

  const rootPath = await createImportRoot(tempRoot, source.repoName);
  try {
    await execFileAsync(
      'git',
      ['clone', '--depth=1', source.cloneUrl, rootPath],
      { timeout: 120000, windowsHide: true },
    );
  } catch (error) {
    return { ok: false, reason: 'git-clone-failed' };
  }

  const scanRoot = source.subpath ? getSafeTargetPath(rootPath, source.subpath) : rootPath;
  const scan = await scanImportCandidates({
    rootPath: scanRoot,
    preferredId: preferredSkillId || source.repoName,
    installPath,
  });
  if (!scan.ok) return scan;
  return resolveSingleOrSelection({
    installPath,
    rootPath: scanRoot,
    candidates: scan.candidates,
    preferredSkillId,
  });
};

const resolveSkillpkgUrl = async ({ apiKey }) => {
  if (!apiKey?.trim()) {
    return { ok: false, reason: 'api-key-required' };
  }
  return { ok: false, reason: 'api-not-configured' };
};

const importFromSession = async ({ sessionId, candidateId, candidateIds, installPath }) => {
  pruneSessions();
  const session = importSessions.get(sessionId);
  if (!session) return { ok: false, reason: 'session-expired' };
  const selectedIds = Array.isArray(candidateIds) && candidateIds.length
    ? candidateIds
    : candidateId ? [candidateId] : [];
  if (!selectedIds.length) return { ok: false, reason: 'candidate-missing' };
  const selectedIdSet = new Set(selectedIds);
  const candidates = session.candidates.filter((item) => selectedIdSet.has(item.id));
  if (!candidates.length) return { ok: false, reason: 'candidate-missing' };
  const result = await importCandidatesToLibrary({
    installPath,
    rootPath: session.rootPath,
    candidates,
  });
  if (result.ok) importSessions.delete(sessionId);
  return result;
};

const importSkillSource = async (payload) => {
  pruneSessions();
  const { kind, installPath, tempRoot } = payload || {};
  if (!tempRoot) return { ok: false, reason: 'temp-root-missing' };
  await ensureDir(tempRoot);
  if (!installPath && kind !== 'skillpkg') return { ok: false, reason: 'install-path-missing' };

  if (kind === 'zip') return importFromZip(payload);
  if (kind === 'git') return importFromGit(payload);
  if (kind === 'skillpkg') return resolveSkillpkgUrl(payload);
  if (kind === 'session') return importFromSession(payload);
  return { ok: false, reason: 'unsupported-source' };
};

module.exports = {
  importSkillSource,
  normalizeGitSource,
  resolveSkillpkgUrl,
  scanImportCandidates,
};
