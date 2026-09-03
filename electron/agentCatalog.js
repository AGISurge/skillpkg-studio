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
  workbuddy: {
    id: 'workbuddy',
    name: 'WorkBuddy',
    homePath: {
      darwin: '~/.workbuddy',
      win32: '%USERPROFILE%/.workbuddy',
      other: '~/.workbuddy',
    },
    skillPath: {
      darwin: '~/.workbuddy/skills',
      win32: '%USERPROFILE%/.workbuddy/skills',
      other: '~/.workbuddy/skills',
    },
  },
  trae: {
    id: 'trae',
    name: 'TRAE',
    homePath: {
      darwin: '~/.trae',
      win32: '%USERPROFILE%/.trae',
      other: '~/.trae',
    },
    skillPath: {
      darwin: '~/.trae/skills',
      win32: '%USERPROFILE%/.trae/skills',
      other: '~/.trae/skills',
    },
  },
  pi: {
    id: 'pi',
    name: 'Pi',
    homePath: {
      darwin: '~/.pi/agent',
      win32: '%USERPROFILE%/.pi/agent',
      other: '~/.pi/agent',
    },
    skillPath: {
      darwin: '~/.pi/agent/skills',
      win32: '%USERPROFILE%/.pi/agent/skills',
      other: '~/.pi/agent/skills',
    },
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    homePath: {
      darwin: '~/.config/opencode',
      win32: '%USERPROFILE%/.config/opencode',
      other: '~/.config/opencode',
    },
    skillPath: {
      darwin: '~/.config/opencode/skills',
      win32: '%USERPROFILE%/.config/opencode/skills',
      other: '~/.config/opencode/skills',
    },
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    homePath: {
      darwin: '~/.gemini',
      win32: '%USERPROFILE%/.gemini',
      other: '~/.gemini',
    },
    skillPath: {
      darwin: '~/.gemini/skills',
      win32: '%USERPROFILE%/.gemini/skills',
      other: '~/.gemini/skills',
    },
  },
  copilot: {
    id: 'copilot',
    name: 'Copilot',
    homePath: {
      darwin: '~/.copilot',
      win32: '%USERPROFILE%/.copilot',
      other: '~/.copilot',
    },
    skillPath: {
      darwin: '~/.copilot/skills',
      win32: '%USERPROFILE%/.copilot/skills',
      other: '~/.copilot/skills',
    },
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    homePath: {
      darwin: '~/.grok',
      win32: '%USERPROFILE%/.grok',
      other: '~/.grok',
    },
    skillPath: {
      darwin: '~/.grok/skills',
      win32: '%USERPROFILE%/.grok/skills',
      other: '~/.grok/skills',
    },
  },
  qwenworkcn: {
    id: 'qwenworkcn',
    name: '千问办公',
    homePath: {
      darwin: '~/.qwenworkcn',
      win32: '%USERPROFILE%/.qwenworkcn',
      other: '~/.qwenworkcn',
    },
    skillPath: {
      darwin: '~/.qwenworkcn/skills',
      win32: '%USERPROFILE%/.qwenworkcn/skills',
      other: '~/.qwenworkcn/skills',
    },
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    homePath: {
      darwin: '~/.qwen',
      win32: '%USERPROFILE%/.qwen',
      other: '~/.qwen',
    },
    skillPath: {
      darwin: '~/.qwen/skills',
      win32: '%USERPROFILE%/.qwen/skills',
      other: '~/.qwen/skills',
    },
  },
};

const AGENT_TOOL_IDS = Object.keys(AGENT_CATALOG);

// The cross-agent skills directory is an organize-only source. It is deliberately
// kept out of AGENT_CATALOG so it does not appear as an install target.
const DEFAULT_ORGANIZE_SKILL_SOURCE = {
  id: 'agents-default',
  name: 'Universal',
  homePath: {
    darwin: '~/.agents',
    win32: '%USERPROFILE%/.agents',
    other: '~/.agents',
  },
  skillPath: {
    darwin: '~/.agents/skills',
    win32: '%USERPROFILE%/.agents/skills',
    other: '~/.agents/skills',
  },
};

const getPlatformKey = () => {
  const platform = os.platform();
  if (platform === 'darwin' || platform === 'win32') return platform;
  return 'other';
};

const resolveConfiguredPath = (configured) => {
  if (!configured) return null;
  if (typeof configured === 'string') return resolveTemplatePath(configured);
  const platformKey = getPlatformKey();
  return resolveTemplatePath(configured[platformKey] || configured.other);
};

const resolveAgentSkillPath = (agentOrId) => {
  const agent = typeof agentOrId === 'string' ? AGENT_CATALOG[agentOrId] : agentOrId;
  if (!agent) return null;
  const configured = agent.skillPath || {
    darwin: agent.pathMac,
    win32: agent.pathWindows,
    other: agent.pathMac,
  };
  return resolveConfiguredPath(configured);
};

const resolveAgentHomePath = (agentOrId) => {
  const agent = typeof agentOrId === 'string' ? AGENT_CATALOG[agentOrId] : agentOrId;
  if (!agent) return null;
  const configured = agent.homePath || {
    darwin: agent.pathMac ? path.dirname(agent.pathMac) : null,
    win32: agent.pathWindows ? path.dirname(agent.pathWindows) : null,
    other: agent.pathLinux || (agent.pathMac ? path.dirname(agent.pathMac) : null),
  };
  return resolveConfiguredPath(configured);
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
  const fallback = {
    ...agentOrId,
    skillPath: agentOrId.skillPath || {
      darwin: agentOrId.pathMac,
      win32: agentOrId.pathWindows,
      other: agentOrId.pathLinux || agentOrId.pathMac,
    },
  };
  const catalogAgent = AGENT_CATALOG[agentOrId.id];
  if (!catalogAgent) return fallback;
  return {
    ...catalogAgent,
    ...agentOrId,
    homePath: agentOrId.homePath || catalogAgent.homePath,
    skillPath: agentOrId.skillPath || catalogAgent.skillPath,
  };
};

module.exports = {
  AGENT_CATALOG,
  AGENT_TOOL_IDS,
  DEFAULT_ORGANIZE_SKILL_SOURCE,
  detectAgent,
  getAgentConfig,
  resolveAgentHomePath,
  resolveAgentSkillPath,
};
