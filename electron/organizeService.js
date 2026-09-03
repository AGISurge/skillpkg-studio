const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const {
  DEFAULT_ORGANIZE_SKILL_SOURCE,
  getAgentConfig,
  resolveAgentSkillPath,
} = require('./agentCatalog');
const { finalizeMigratedSkillSource } = require('./agentService');
const {
  ensureDir,
  pathEntryExists,
  pathExists,
  removeIfExists,
} = require('./pathUtils');
const {
  SKILL_MARKDOWN_FILENAME,
  hasSkillMarkdown,
  parseSkillMarkdownMetadata,
} = require('./skillScanner');

const isSafeSkillId = (skillId) =>
  Boolean(skillId) &&
  typeof skillId === 'string' &&
  !skillId.includes('/') &&
  !skillId.includes('\\') &&
  skillId !== '.' &&
  skillId !== '..';

const getErrorDetail = (error) => {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : String(error || '');
  if (code && !message.includes(code)) return `${code}: ${message}`;
  return message || code || 'Unknown migration error';
};

const getSkillMarkdownMetadata = async (skillDir) => {
  const content = await fs
    .readFile(path.join(skillDir, SKILL_MARKDOWN_FILENAME), 'utf-8')
    .catch(() => '');
  return parseSkillMarkdownMetadata(content);
};

const copySkillDirIntoLibrary = async ({ sourceDir, targetDir, installPath }) => {
  const sourceRealPath = await fs.realpath(sourceDir);
  const tempDir = path.join(
    installPath,
    `.${path.basename(targetDir)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
  );
  await removeIfExists(tempDir);
  try {
    await fs.cp(sourceRealPath, tempDir, { recursive: true, force: true });
    if (!await hasSkillMarkdown(tempDir)) {
      return { ok: false, reason: 'invalid-skill' };
    }
    await removeIfExists(targetDir);
    await fs.rename(tempDir, targetDir);
    return { ok: true };
  } finally {
    await removeIfExists(tempDir);
  }
};

const migrateAgentSkillToLibrary = async ({
  installPath,
  item,
  overwrite,
  useExisting,
  onLinked,
}) => {
  if (!isSafeSkillId(item?.skillId)) {
    return {
      agentId: item?.agentId,
      skillId: item?.skillId,
      ok: false,
      reason: 'invalid-skill-id',
    };
  }

  const agentConfig = getAgentConfig({
    id: item.agentId,
    name: item.agentName || item.agentId,
    pathMac: item.pathMac,
    pathLinux: item.pathLinux,
    pathWindows: item.pathWindows,
    skillPath: item.skillPath,
  }) || getAgentConfig(item.agentId);
  const agentSkillPath = agentConfig ? resolveAgentSkillPath(agentConfig) : null;
  const sourceRoot = item.rootPath || (
    agentSkillPath ? path.join(agentSkillPath, item.skillId) : null
  );
  if (!sourceRoot) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: false,
      reason: 'source-missing',
    };
  }

  const targetDir = path.join(installPath, item.skillId);
  const targetEntryExists = await pathEntryExists(targetDir);
  const targetLstat = targetEntryExists
    ? await fs.lstat(targetDir).catch(() => null)
    : null;
  const targetIsSymlink = Boolean(targetLstat?.isSymbolicLink());

  // Report an existing managed copy before checking the source. This lets the
  // confirmed useExisting retry repair a broken Agent link whose old target has
  // already disappeared.
  if (targetEntryExists && !targetIsSymlink && !overwrite && !useExisting) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: false,
      reason: 'exists',
    };
  }

  if (useExisting && !targetIsSymlink) {
    if (!await hasSkillMarkdown(targetDir)) {
      return {
        agentId: item.agentId,
        skillId: item.skillId,
        ok: false,
        reason: 'invalid-managed-skill',
      };
    }
  } else {
    if (!await pathExists(sourceRoot)) {
      return {
        agentId: item.agentId,
        skillId: item.skillId,
        ok: false,
        reason: 'skill-missing',
      };
    }
    const copyResult = await copySkillDirIntoLibrary({
      sourceDir: sourceRoot,
      targetDir,
      installPath,
    });
    if (!copyResult.ok) {
      return {
        agentId: item.agentId,
        skillId: item.skillId,
        ok: false,
        reason: copyResult.reason,
      };
    }
  }

  let linkResult;
  try {
    linkResult = await finalizeMigratedSkillSource({
      agent: agentConfig,
      skillId: item.skillId,
      sourceRoot,
      targetDir,
    });
  } catch (error) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: false,
      reason: 'link-failed',
      detail: getErrorDetail(error),
    };
  }
  if (!linkResult.ok) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: false,
      reason: linkResult.reason,
    };
  }
  if (linkResult.linked === false) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: true,
      linked: false,
    };
  }

  const markdownMetadata = await getSkillMarkdownMetadata(targetDir);
  if (onLinked) {
    await onLinked({
      skillId: item.skillId,
      agentId: item.agentId,
      version: markdownMetadata.version || null,
      description: markdownMetadata.description || null,
    });
  }
  return { agentId: item.agentId, skillId: item.skillId, ok: true };
};

const migrateSkillsToLibrary = async ({
  installPath,
  items,
  overwrite = false,
  useExisting = false,
  onLinked,
}) => {
  if (!installPath || !Array.isArray(items) || !items.length) return [];
  await ensureDir(installPath);

  const groups = new Map();
  items.forEach((item, index) => {
    const entries = groups.get(item.skillId) || [];
    entries.push({ item, index });
    groups.set(item.skillId, entries);
  });
  const results = new Array(items.length);

  await Promise.all([...groups.values()].map(async (entries) => {
    // Agent aliases must be replaced before the Universal source is removed.
    const orderedEntries = [...entries].sort((left, right) => {
      const leftIsDefault = left.item.agentId === DEFAULT_ORGANIZE_SKILL_SOURCE.id;
      const rightIsDefault = right.item.agentId === DEFAULT_ORGANIZE_SKILL_SOURCE.id;
      return Number(leftIsDefault) - Number(rightIsDefault);
    });
    let managedCopyReady = Boolean(useExisting);

    for (const entry of orderedEntries) {
      try {
        const result = await migrateAgentSkillToLibrary({
          installPath,
          item: entry.item,
          overwrite,
          useExisting: useExisting || managedCopyReady,
          onLinked,
        });
        results[entry.index] = result;
        if (result.ok) managedCopyReady = true;
      } catch (error) {
        results[entry.index] = {
          agentId: entry.item.agentId,
          skillId: entry.item.skillId,
          ok: false,
          reason: 'migrate-failed',
          detail: getErrorDetail(error),
        };
      }
    }
  }));

  return results;
};

module.exports = {
  copySkillDirIntoLibrary,
  migrateAgentSkillToLibrary,
  migrateSkillsToLibrary,
};
