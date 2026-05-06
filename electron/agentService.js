const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { detectAgent, getAgentConfig, resolveAgentSkillPath } = require('./agentCatalog');
const { ensureDir, pathExists, removeIfExists } = require('./pathUtils');
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

module.exports = {
  ensureAgentSkillLink,
  listInstalledAgents,
  loadAgentSkills,
  uninstallAgentSkillLink,
};
