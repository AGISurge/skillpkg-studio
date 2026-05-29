const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const { resolveTemplatePath } = require('./pathUtils');

const AGENT_CATALOG = {
  claude: {
    id: 'claude',
    name: 'Claude (Code)',
    homePath: {
      darwin: '~/.claude',
      win32: '%USERPROFILE%/.claude',
      other: '~/.claude',
    },
    skillPath: {
      darwin: '~/.claude/skills',
      win32: '%USERPROFILE%/.claude/skills',
      other: '~/.claude/skills',
    },
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    homePath: {
      darwin: '~/.codex',
      win32: '%USERPROFILE%/.codex',
      other: '~/.codex',
    },
    skillPath: {
      darwin: '~/.codex/skills',
      win32: '%USERPROFILE%/.codex/skills',
      other: '~/.codex/skills',
    },
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    homePath: {
      darwin: '~/.cursor',
      win32: '%USERPROFILE%/.cursor',
      other: '~/.cursor',
    },
    skillPath: {
      darwin: '~/.cursor/skills',
      win32: '%USERPROFILE%/.cursor/skills',
      other: '~/.cursor/skills',
    },
  },
  qoder: {
    id: 'qoder',
    name: 'Qoder',
    homePath: {
      darwin: '~/.qoder',
      win32: '%USERPROFILE%/.qoder',
      other: '~/.qoder',
    },
    skillPath: {
      darwin: '~/.qoder/skills',
      win32: '%USERPROFILE%/.qoder/skills',
      other: '~/.qoder/skills',
    },
  },
  codebuddy: {
    id: 'codebuddy',
    name: 'CodeBuddy',
    homePath: {
      darwin: '~/.codebuddy',
      win32: '%USERPROFILE%/.codebuddy',
      other: '~/.codebuddy',
    },
    skillPath: {
      darwin: '~/.codebuddy/skills',
      win32: '%USERPROFILE%/.codebuddy/skills',
      other: '~/.codebuddy/skills',
    },
  },
};

const AGENT_TOOL_IDS = Object.keys(AGENT_CATALOG);

const getPlatformKey = () => {
  const platform = os.platform();
  if (platform === 'darwin' || platform === 'win32') return platform;
  return 'other';
};

const resolveAgentSkillPath = (agentOrId) => {
  const agent = typeof agentOrId === 'string' ? AGENT_CATALOG[agentOrId] : agentOrId;
  if (!agent) return null;
  const configured = agent.skillPath || {
    darwin: agent.pathMac,
    win32: agent.pathWindows,
    other: agent.pathMac,
  };
  return resolveTemplatePath(configured[getPlatformKey()] || configured.other);
};

const resolveAgentHomePath = (agentOrId) => {
  const agent = typeof agentOrId === 'string' ? AGENT_CATALOG[agentOrId] : agentOrId;
  if (!agent) return null;
  const configured = agent.homePath || {
    darwin: agent.pathMac ? path.dirname(agent.pathMac) : null,
    win32: agent.pathWindows ? path.dirname(agent.pathWindows) : null,
    other: agent.pathLinux || (agent.pathMac ? path.dirname(agent.pathMac) : null),
  };
  return resolveTemplatePath(configured[getPlatformKey()] || configured.other);
};

const isNonEmptyDirectory = async (targetPath) => {
  if (!targetPath) return false;
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) return false;
    const entries = await fs.readdir(targetPath);
    return entries.length > 0;
  } catch (_error) {
    return false;
  }
};

const detectAgent = async (agentId) => {
  const agent = AGENT_CATALOG[agentId];
  if (!agent) {
    return { id: agentId, name: agentId, installed: false, reason: 'unsupported-agent', skillPath: null };
  }
  const homePath = resolveAgentHomePath(agent);
  if (await isNonEmptyDirectory(homePath)) {
    return {
      id: agent.id,
      name: agent.name,
      installed: true,
      reason: homePath,
      skillPath: resolveAgentSkillPath(agent),
    };
  }
  return {
    id: agent.id,
    name: agent.name,
    installed: false,
    reason: homePath || 'agent-home-path-missing',
    skillPath: resolveAgentSkillPath(agent),
  };
};

const getAgentConfig = (agentOrId) => {
  if (typeof agentOrId === 'string') return AGENT_CATALOG[agentOrId] || null;
  if (!agentOrId?.id) return null;
  return AGENT_CATALOG[agentOrId.id] || {
    ...agentOrId,
    skillPath: {
      darwin: agentOrId.pathMac,
      win32: agentOrId.pathWindows,
      other: agentOrId.pathLinux || agentOrId.pathMac,
    },
  };
};

module.exports = {
  AGENT_CATALOG,
  AGENT_TOOL_IDS,
  detectAgent,
  getAgentConfig,
  resolveAgentHomePath,
  resolveAgentSkillPath,
};
