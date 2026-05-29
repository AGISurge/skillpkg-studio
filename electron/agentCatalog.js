const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const { pathExists, resolveTemplatePath } = require('./pathUtils');

const AGENT_CATALOG = {
  claude: {
    id: 'claude',
    name: 'Claude',
    skillPath: {
      darwin: '~/.claude/skills',
      win32: '%USERPROFILE%\\.claude\\skills',
      other: '~/.claude/skills',
    },
    detect: [
      { type: 'cli', command: 'claude', args: ['--version'] },
      { type: 'path', path: '~/.claude' },
      { type: 'app', bundles: ['Claude.app'] },
    ],
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    skillPath: {
      darwin: '~/.codex/skills',
      win32: '%USERPROFILE%\\.codex\\skills',
      other: '~/.codex/skills',
    },
    detect: [
      { type: 'cli', command: 'codex', args: ['--version'] },
      { type: 'path', path: '~/.codex' },
      { type: 'app', bundles: ['Codex.app'] },
    ],
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    skillPath: {
      darwin: '~/.cursor/skills',
      win32: '%USERPROFILE%\\.cursor\\skills',
      other: '~/.cursor/skills',
    },
    detect: [
      { type: 'cli', command: 'cursor', args: ['--version'] },
      { type: 'path', path: '~/.cursor' },
      { type: 'app', bundles: ['Cursor.app'] },
    ],
  },
  qoder: {
    id: 'qoder',
    name: 'Qoder',
    skillPath: {
      darwin: '~/.qoder/skills',
      win32: '%USERPROFILE%\\.qoder\\skills',
      other: '~/.qoder/skills',
    },
    detect: [
      { type: 'path', path: os.platform() === 'win32' ? '%USERPROFILE%\\.qoder' : '~/.qoder' },
      {
        type: 'app',
        bundles: ['Qoder.app'],
        paths: {
          linux: [
            '/usr/share/applications/qoder.desktop',
            '~/.local/share/applications/qoder.desktop',
            '/opt/Qoder/qoder',
            '/opt/Qoder/Qoder',
            '~/Applications/Qoder.AppImage',
          ],
          win32: [
            '%LOCALAPPDATA%/Programs/Qoder/Qoder.exe',
            '%LOCALAPPDATA%/Programs/qoder/Qoder.exe',
            '%LOCALAPPDATA%/Programs/Qoder/resources/app/resources/bin/Qoder.exe',
            '%PROGRAMFILES%/Qoder/Qoder.exe',
          ],
        },
      },
      { type: 'cli', command: 'qodercli', args: ['--version'] },
      { type: 'cli', command: 'qordercli', args: ['--version'] },
    ],
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

const getAppBundleCandidates = (criterion) => {
  const platform = os.platform();
  const platformKey = platform === 'linux' ? 'linux' : getPlatformKey();
  const configuredPaths = Array.isArray(criterion.paths)
    ? criterion.paths
    : criterion.paths?.[platformKey] || [];
  const appPaths = configuredPaths
    .map((candidate) => resolveTemplatePath(candidate))
    .filter(Boolean);
  if (platform !== 'darwin') return appPaths;

  const bundles = criterion.bundles || [];
  const homeDir = os.homedir();
  const roots = ['/Applications'];
  if (homeDir) roots.push(path.join(homeDir, 'Applications'));
  return [
    ...appPaths,
    ...roots.flatMap((root) => bundles.map((bundle) => path.join(root, bundle))),
  ];
};

const detectCli = (criterion) =>
  new Promise((resolve) => {
    const env = {
      ...process.env,
      PATH: [
        process.env.PATH || '',
        '/opt/homebrew/bin',
        '/usr/local/bin',
        path.join(os.homedir(), '.local', 'bin'),
      ].join(path.delimiter),
    };
    childProcess.execFile(
      criterion.command,
      criterion.args || ['--version'],
      { env, timeout: 2500, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, reason: `${criterion.command} command unavailable` });
          return;
        }
        const output = `${stdout || ''}${stderr || ''}`.trim();
        resolve({ ok: true, reason: output || `${criterion.command} command responded` });
      },
    );
  });

const detectCriterion = async (criterion) => {
  if (criterion.type === 'cli') return detectCli(criterion);
  if (criterion.type === 'path') {
    const resolvedPath = resolveTemplatePath(criterion.path);
    return {
      ok: Boolean(resolvedPath) && await pathExists(resolvedPath),
      reason: resolvedPath || criterion.path,
    };
  }
  if (criterion.type === 'app') {
    const candidates = getAppBundleCandidates(criterion);
    for (const candidate of candidates) {
      if (await pathExists(candidate)) return { ok: true, reason: candidate };
    }
    return { ok: false, reason: candidates[0] || 'app bundle not configured' };
  }
  return { ok: false, reason: 'unknown detector' };
};

const detectAgent = async (agentId) => {
  const agent = AGENT_CATALOG[agentId];
  if (!agent) {
    return { id: agentId, name: agentId, installed: false, reason: 'unsupported-agent', skillPath: null };
  }
  for (const criterion of agent.detect || []) {
    const result = await detectCriterion(criterion);
    if (result.ok) {
      return {
        id: agent.id,
        name: agent.name,
        installed: true,
        reason: result.reason,
        skillPath: resolveAgentSkillPath(agent),
      };
    }
  }
  return {
    id: agent.id,
    name: agent.name,
    installed: false,
    reason: 'not-detected',
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
      other: agentOrId.pathMac,
    },
  };
};

module.exports = {
  AGENT_CATALOG,
  AGENT_TOOL_IDS,
  detectAgent,
  getAgentConfig,
  resolveAgentSkillPath,
};
