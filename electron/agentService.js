const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { detectAgent, getAgentConfig, resolveAgentSkillPath } = require('./agentCatalog');
const {
  ensureDir,
  getDefaultSkillLibraryPath,
  getLegacySkillLibraryPath,
  isPathInside,
  normalizeRealPath,
  pathExists,
  removeIfExists,
} = require('./pathUtils');
const { loadSkillsFromPath } = require('./skillScanner');

const listInstalledAgents = async (agentIds) => {
  const list = Array.isArray(agentIds) ? agentIds : agentIds ? [agentIds] : [];
  return Promise.all(list.map((agentId) => detectAgent(agentId)));
};

const loadAgentSkills = async ({ agents, installPath }) => {
  const list = Array.isArray(agents) ? agents : [];
  return Promise.all(
    list.map(async (agent) => {
      const config = getAgentConfig(agent);
      const skillPath = resolveAgentSkillPath(config);
      const skills = skillPath
        ? await loadSkillsFromPath(skillPath, {
            mode: 'agent',
            agentId: config.id,
            installPath,
          })
        : [];
      return {
        agentId: config.id,
        agentName: config.name,
        skillPath,
        skills,
      };
    }),
  );
};

const ensureAgentSkillLink = async ({ agent, skillId, targetDir }) => {
  const config = getAgentConfig(agent);
  const skillRoot = resolveAgentSkillPath(config);
  if (!skillRoot) return { ok: false, reason: 'agent-path-missing' };
  await ensureDir(skillRoot);
  const linkPath = path.join(skillRoot, skillId);
  if (await pathExists(linkPath)) {
    const lstat = await fs.lstat(linkPath);
    if (!lstat.isSymbolicLink()) {
      return { ok: false, reason: 'agent-skill-conflict', agentId: config.id };
    }
    await removeIfExists(linkPath);
  }
  const linkType = os.platform() === 'win32' ? 'junction' : 'dir';
  await fs.symlink(targetDir, linkPath, linkType);
  return { ok: true, agentId: config.id };
};

const linkSkillToAgents = async ({ agents, skillId, targetDir }) => {
  const agentList = Array.isArray(agents) ? agents : [];
  const results = await Promise.all(
    agentList.map(async (agent) => {
      const config = getAgentConfig(agent);
      try {
        const result = await ensureAgentSkillLink({
          agent: config || agent,
          skillId,
          targetDir,
        });
        return {
          ...result,
          agentId: result.agentId || config?.id || agent?.id,
        };
      } catch (_error) {
        return {
          agentId: config?.id || agent?.id,
          ok: false,
          reason: 'link-failed',
        };
      }
    }),
  );
  const hasSuccess = results.some((result) => result.ok);
  const failed = results.find((result) => !result.ok);
  return {
    ok: hasSuccess,
    reason: hasSuccess ? (failed ? 'partial-failure' : undefined) : failed?.reason || 'install-failed',
    results,
  };
};

const uninstallAgentSkillLink = async ({ agent, skillId, installPath }) => {
  const config = getAgentConfig(agent);
  const skillRoot = resolveAgentSkillPath(config);
  if (!skillRoot) return { ok: false, reason: 'agent-path-missing' };
  const linkPath = path.join(skillRoot, skillId);
  if (!await pathExists(linkPath)) return { ok: true, removed: false };
  const lstat = await fs.lstat(linkPath);
  if (!lstat.isSymbolicLink()) {
    return { ok: false, reason: 'not-managed-link' };
  }
  const realTarget = await fs.realpath(linkPath).catch(() => null);
  const realInstallPath = installPath ? await fs.realpath(installPath).catch(() => null) : null;
  if (
    realTarget &&
    realInstallPath &&
    path.relative(realInstallPath, realTarget).startsWith('..')
  ) {
    return { ok: false, reason: 'not-managed-link' };
  }
  await removeIfExists(linkPath);
  return { ok: true, removed: true };
};

const getDefaultManagedRoots = () => [
  getDefaultSkillLibraryPath(),
  getDefaultSkillLibraryPath({ platform: 'darwin' }),
  getDefaultSkillLibraryPath({ platform: 'linux' }),
  getLegacySkillLibraryPath(),
].filter(Boolean);

const getManagedRootPaths = async (installPath) => {
  const roots = [
    installPath,
    ...getDefaultManagedRoots(),
  ].filter(Boolean);
  const uniqueRoots = Array.from(new Set(roots.map((root) => path.normalize(root))));
  const resolvedRoots = await Promise.all(
    uniqueRoots.map((root) => normalizeRealPath(root).catch(() => null)),
  );
  return Array.from(new Set([...uniqueRoots, ...resolvedRoots.filter(Boolean)]));
};

const getSymlinkTargetPath = async (linkPath) => {
  const target = await fs.readlink(linkPath).catch(() => null);
  if (!target) return null;
  const absoluteTarget = path.isAbsolute(target)
    ? target
    : path.resolve(path.dirname(linkPath), target);
  return path.normalize(absoluteTarget);
};

const isManagedTarget = (targetPath, managedRootPaths) =>
  Boolean(targetPath && managedRootPaths.some((rootPath) => isPathInside(targetPath, rootPath)));

const isSafeSkillId = (skillId) =>
  Boolean(skillId) &&
  typeof skillId === 'string' &&
  !skillId.includes('/') &&
  !skillId.includes('\\') &&
  skillId !== '.' &&
  skillId !== '..';

const resolveSkillEntryPath = async (rootPath, skillId) => {
  if (!rootPath || !isSafeSkillId(skillId)) return null;
  const targetPath = path.normalize(path.join(rootPath, skillId));
  if (!isPathInside(targetPath, rootPath)) return null;
  return targetPath;
};

const skillEntryExists = async (entryPath) => {
  try {
    await fs.lstat(entryPath);
    return true;
  } catch (_error) {
    return false;
  }
};

const deleteAgentSkillEntry = async ({ agent, skillId }) => {
  const config = getAgentConfig(agent);
  const skillRoot = resolveAgentSkillPath(config);
  const entryPath = await resolveSkillEntryPath(skillRoot, skillId);
  if (!skillRoot || !entryPath) return { ok: false, reason: 'invalid' };
  if (!await skillEntryExists(entryPath)) return { ok: true, removed: false, agentId: config.id };
  await removeIfExists(entryPath);
  return { ok: true, removed: true, agentId: config.id };
};

const deleteLibrarySkillEntry = async ({ installPath, skillId, agents }) => {
  const entryPath = await resolveSkillEntryPath(installPath, skillId);
  if (!installPath || !entryPath) return { ok: false, reason: 'invalid', results: [] };

  const agentList = Array.isArray(agents) ? agents : [];
  const results = [];
  for (const agent of agentList) {
    const config = getAgentConfig(agent);
    try {
      const result = await uninstallAgentSkillLink({
        agent: config,
        skillId,
        installPath,
      });
      results.push({ ...result, agentId: config?.id });
    } catch (_error) {
      results.push({ ok: false, reason: 'uninstall-failed', agentId: config?.id });
    }
  }

  const failed = results.find((result) => !result.ok);
  if (failed) {
    return {
      ok: false,
      reason: failed.reason || 'uninstall-failed',
      results,
    };
  }

  if (!await skillEntryExists(entryPath)) {
    return { ok: true, removed: false, results };
  }
  await removeIfExists(entryPath);
  return { ok: true, removed: true, results };
};

const unhostAgentSkillLink = async ({ agent, skillId, installPath }) => {
  const config = getAgentConfig(agent);
  const skillRoot = resolveAgentSkillPath(config);
  if (!skillRoot) return { ok: false, reason: 'agent-path-missing' };
  const linkPath = path.join(skillRoot, skillId);
  if (!await pathExists(linkPath)) return { ok: false, reason: 'skill-missing' };
  const lstat = await fs.lstat(linkPath);
  if (!lstat.isSymbolicLink()) {
    return { ok: false, reason: 'not-managed-link' };
  }
  const directTarget = await getSymlinkTargetPath(linkPath);
  const realTarget = await fs.realpath(linkPath).catch(() => null);
  const managedRootPaths = await getManagedRootPaths(installPath);
  if (
    !realTarget ||
    !(
      isManagedTarget(directTarget, managedRootPaths) ||
      isManagedTarget(realTarget, managedRootPaths)
    )
  ) {
    return { ok: false, reason: 'not-managed-link' };
  }
  const tempPath = path.join(skillRoot, `.${skillId}.${process.pid}.${Date.now()}.tmp`);
  await removeIfExists(tempPath);
  await fs.cp(realTarget, tempPath, { recursive: true, force: true });
  await removeIfExists(linkPath);
  await fs.rename(tempPath, linkPath);
  return { ok: true, removed: true };
};

module.exports = {
  deleteAgentSkillEntry,
  deleteLibrarySkillEntry,
  ensureAgentSkillLink,
  linkSkillToAgents,
  listInstalledAgents,
  loadAgentSkills,
  unhostAgentSkillLink,
  uninstallAgentSkillLink,
};
