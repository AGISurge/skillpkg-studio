const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const {
  AGENT_CATALOG,
  getAgentConfig,
  resolveAgentHomePath,
  resolveAgentSkillPath,
} = require('./agentCatalog');
const {
  ensureDir,
  isPathInside,
  normalizeRealPath,
  pathExists,
  removeIfExists,
} = require('./pathUtils');
const { hasSkillMarkdown } = require('./skillScanner');

const normalizePath = (targetPath) => (
  targetPath ? path.normalize(path.resolve(targetPath)) : null
);

const normalizeMaybeRealPath = async (targetPath) => {
  if (!targetPath) return null;
  return normalizeRealPath(targetPath).catch(() => normalizePath(targetPath));
};

const uniqPaths = (paths) => Array.from(new Set(paths.filter(Boolean).map(normalizePath)));

const getInstallPathDialogOptions = () => ({
  properties: ['openDirectory', 'createDirectory', 'showHiddenFiles'],
});

const getProtectedAgentPaths = (agents = []) => {
  const catalogAgents = Object.values(AGENT_CATALOG);
  const providedAgents = Array.isArray(agents) ? agents : [];
  const configs = [...catalogAgents, ...providedAgents]
    .map((agent) => getAgentConfig(agent) || agent)
    .filter(Boolean);

  return uniqPaths(
    configs.flatMap((agent) => [
      resolveAgentHomePath(agent),
      resolveAgentSkillPath(agent),
    ]),
  );
};

const getPathVariants = async (targetPath) => {
  const normalized = normalizePath(targetPath);
  const real = await normalizeMaybeRealPath(targetPath);
  return uniqPaths([normalized, real]);
};

const isSamePath = async (leftPath, rightPath) => {
  const leftVariants = await getPathVariants(leftPath);
  const rightVariants = await getPathVariants(rightPath);
  return leftVariants.some((left) => rightVariants.includes(left));
};

const isPathInsideAny = (targetPath, parentPaths) =>
  parentPaths.some((parentPath) => isPathInside(targetPath, parentPath));

const validateInstallPathChange = async ({ fromInstallPath, toInstallPath, agents }) => {
  if (!toInstallPath || typeof toInstallPath !== 'string') {
    return { ok: false, reason: 'invalid-path' };
  }

  const targetVariants = await getPathVariants(toInstallPath);
  const protectedPaths = getProtectedAgentPaths(agents);
  if (targetVariants.some((variant) => isPathInsideAny(variant, protectedPaths))) {
    return { ok: false, reason: 'agent-directory' };
  }

  if (fromInstallPath) {
    if (await isSamePath(fromInstallPath, toInstallPath)) {
      return { ok: false, reason: 'same-path' };
    }

    const fromVariants = await getPathVariants(fromInstallPath);
    const nested = fromVariants.some((fromVariant) =>
      targetVariants.some((targetVariant) =>
        isPathInside(targetVariant, fromVariant) || isPathInside(fromVariant, targetVariant),
      ),
    );
    if (nested) {
      return { ok: false, reason: 'nested-path' };
    }
  }

  return { ok: true };
};

const collectLibrarySkillIds = async (installPath) => {
  if (!installPath || !await pathExists(installPath)) return [];
  const entries = await fs.readdir(installPath, { withFileTypes: true }).catch(() => []);
  const skillIds = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillId = entry.name;
    if (skillId === '.' || skillId === '..' || skillId.includes('/') || skillId.includes('\\')) {
      continue;
    }
    const skillPath = path.join(installPath, skillId);
    if (await hasSkillMarkdown(skillPath)) {
      skillIds.push(skillId);
    }
  }
  return skillIds.sort((a, b) => a.localeCompare(b));
};

const getSymlinkTargetPath = async (linkPath) => {
  const target = await fs.readlink(linkPath).catch(() => null);
  if (!target) return null;
  return path.normalize(path.isAbsolute(target)
    ? target
    : path.resolve(path.dirname(linkPath), target));
};

const isManagedLinkToRoot = async (linkPath, rootVariants) => {
  const directTarget = await getSymlinkTargetPath(linkPath);
  const realTarget = await normalizeMaybeRealPath(linkPath);
  return [directTarget, realTarget]
    .filter(Boolean)
    .some((target) => rootVariants.some((root) => isPathInside(target, root)));
};

const collectManagedAgentLinks = async ({ fromInstallPath, toInstallPath, agents, skillIds }) => {
  if (!fromInstallPath || !Array.isArray(agents) || !agents.length) return [];
  const fromVariants = await getPathVariants(fromInstallPath);
  const allowedSkillIds = new Set(skillIds || []);
  const links = [];

  for (const agent of agents) {
    const config = getAgentConfig(agent) || agent;
    const skillRoot = resolveAgentSkillPath(config);
    if (!skillRoot || !await pathExists(skillRoot)) continue;

    const entries = await fs.readdir(skillRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isSymbolicLink()) continue;
      const skillId = entry.name;
      if (allowedSkillIds.size && !allowedSkillIds.has(skillId)) continue;

      const linkPath = path.join(skillRoot, skillId);
      if (!await isManagedLinkToRoot(linkPath, fromVariants)) continue;
      links.push({
        agentId: config.id,
        skillId,
        linkPath,
        targetDir: path.join(toInstallPath, skillId),
      });
    }
  }

  return links;
};

const findTargetConflicts = async ({ toInstallPath, skillIds }) => {
  const conflicts = [];
  for (const skillId of skillIds) {
    const targetDir = path.join(toInstallPath, skillId);
    if (await pathExists(targetDir)) {
      conflicts.push({ skillId, path: targetDir });
    }
  }
  return conflicts;
};

const prepareInstallPathChange = async ({ fromInstallPath, toInstallPath, agents }) => {
  const validation = await validateInstallPathChange({ fromInstallPath, toInstallPath, agents });
  if (!validation.ok) {
    return {
      ...validation,
      migratedCount: 0,
      relinkedCount: 0,
      conflicts: [],
    };
  }

  const skillIds = await collectLibrarySkillIds(fromInstallPath);
  const conflicts = await findTargetConflicts({ toInstallPath, skillIds });
  const links = await collectManagedAgentLinks({
    fromInstallPath,
    toInstallPath,
    agents,
    skillIds,
  });

  return {
    ok: conflicts.length === 0,
    reason: conflicts.length ? 'conflicts' : undefined,
    migratedCount: skillIds.length,
    relinkedCount: links.length,
    conflicts,
    skillIds,
  };
};

const copySkillToTarget = async ({ fromInstallPath, toInstallPath, skillId }) => {
  const sourceDir = path.join(fromInstallPath, skillId);
  const targetDir = path.join(toInstallPath, skillId);
  const tempDir = path.join(
    toInstallPath,
    `.${skillId}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
  );

  await removeIfExists(tempDir);
  const sourceRealPath = await fs.realpath(sourceDir).catch(() => sourceDir);
  await fs.cp(sourceRealPath, tempDir, { recursive: true, force: true });
  if (!await hasSkillMarkdown(tempDir)) {
    await removeIfExists(tempDir);
    return { ok: false, reason: 'invalid-skill', skillId };
  }
  await fs.rename(tempDir, targetDir);
  return { ok: true, skillId };
};

const relinkManagedAgentLink = async (link) => {
  await ensureDir(path.dirname(link.linkPath));
  await removeIfExists(link.linkPath);
  const linkType = os.platform() === 'win32' ? 'junction' : 'dir';
  await fs.symlink(link.targetDir, link.linkPath, linkType);
  return { ok: true, agentId: link.agentId, skillId: link.skillId };
};

const migrateInstallPath = async ({ fromInstallPath, toInstallPath, agents }) => {
  const preview = await prepareInstallPathChange({ fromInstallPath, toInstallPath, agents });
  if (!preview.ok) return preview;

  await ensureDir(toInstallPath);
  for (const skillId of preview.skillIds || []) {
    if (await pathExists(path.join(toInstallPath, skillId))) {
      return {
        ...preview,
        ok: false,
        reason: 'conflicts',
        conflicts: [{ skillId, path: path.join(toInstallPath, skillId) }],
      };
    }
  }

  const copied = [];
  try {
    for (const skillId of preview.skillIds || []) {
      const result = await copySkillToTarget({ fromInstallPath, toInstallPath, skillId });
      if (!result.ok) {
        return { ...preview, ok: false, reason: result.reason || 'copy-failed' };
      }
      copied.push(skillId);
    }
  } catch (_error) {
    return { ...preview, ok: false, reason: 'copy-failed' };
  }

  const links = await collectManagedAgentLinks({
    fromInstallPath,
    toInstallPath,
    agents,
    skillIds: preview.skillIds || [],
  });
  const linkResults = [];
  for (const link of links) {
    try {
      linkResults.push(await relinkManagedAgentLink(link));
    } catch (_error) {
      linkResults.push({
        ok: false,
        agentId: link.agentId,
        skillId: link.skillId,
        reason: 'relink-failed',
      });
    }
  }

  const failedLink = linkResults.find((result) => !result.ok);
  if (failedLink) {
    return {
      ...preview,
      ok: false,
      reason: failedLink.reason,
      copiedSkillIds: copied,
      linkResults,
    };
  }

  return {
    ...preview,
    ok: true,
    migratedCount: copied.length,
    relinkedCount: linkResults.length,
    linkResults,
  };
};

module.exports = {
  collectLibrarySkillIds,
  collectManagedAgentLinks,
  getInstallPathDialogOptions,
  getProtectedAgentPaths,
  migrateInstallPath,
  prepareInstallPathChange,
  validateInstallPathChange,
};
