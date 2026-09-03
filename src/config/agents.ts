import type { Agent } from '../types/models';

/**
 * 支持的 Agent 标识列表（固定展示顺序）。
 */
export const AGENT_TOOL_IDS = [
  'claude',
  'codex',
  'cursor',
  'qoder',
  'codebuddy',
  'workbuddy',
  'trae',
  'pi',
  'opencode',
  'gemini',
  'copilot',
  'grok',
  'qwenworkcn',
  'qwen',
] as const;

/**
 * Agent 标识的联合类型。
 */
export type AgentId = (typeof AGENT_TOOL_IDS)[number];

/**
 * Agent 静态配置（按系统区分技能存放路径）。
 */
export const AGENT_CATALOG: Record<AgentId, Agent> = {
  claude: {
    id: 'claude',
    name: 'Claude (Code)',
    pathMac: '~/.claude/skills',
    pathLinux: '~/.claude/skills',
    pathWindows: '%USERPROFILE%\\.claude\\skills',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    pathMac: '~/.codex/skills',
    pathLinux: '~/.codex/skills',
    pathWindows: '%USERPROFILE%\\.codex\\skills',
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    pathMac: '~/.cursor/skills',
    pathLinux: '~/.cursor/skills',
    pathWindows: '%USERPROFILE%\\.cursor\\skills',
  },
  qoder: {
    id: 'qoder',
    name: 'Qoder',
    pathMac: '~/.qoder/skills',
    pathLinux: '~/.qoder/skills',
    pathWindows: '%USERPROFILE%\\.qoder\\skills',
  },
  codebuddy: {
    id: 'codebuddy',
    name: 'CodeBuddy',
    pathMac: '~/.codebuddy/skills',
    pathLinux: '~/.codebuddy/skills',
    pathWindows: '%USERPROFILE%\\.codebuddy\\skills',
  },
  workbuddy: {
    id: 'workbuddy',
    name: 'WorkBuddy',
    pathMac: '~/.workbuddy/skills',
    pathLinux: '~/.workbuddy/skills',
    pathWindows: '%USERPROFILE%\\.workbuddy\\skills',
  },
  trae: {
    id: 'trae',
    name: 'TRAE',
    pathMac: '~/.trae/skills',
    pathLinux: '~/.trae/skills',
    pathWindows: '%USERPROFILE%\\.trae\\skills',
  },
  pi: {
    id: 'pi',
    name: 'Pi',
    pathMac: '~/.pi/agent/skills',
    pathLinux: '~/.pi/agent/skills',
    pathWindows: '%USERPROFILE%\\.pi\\agent\\skills',
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    pathMac: '~/.config/opencode/skills',
    pathLinux: '~/.config/opencode/skills',
    pathWindows: '%USERPROFILE%\\.config\\opencode\\skills',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini CLI',
    pathMac: '~/.gemini/skills',
    pathLinux: '~/.gemini/skills',
    pathWindows: '%USERPROFILE%\\.gemini\\skills',
  },
  copilot: {
    id: 'copilot',
    name: 'Copilot',
    pathMac: '~/.copilot/skills',
    pathLinux: '~/.copilot/skills',
    pathWindows: '%USERPROFILE%\\.copilot\\skills',
  },
  grok: {
    id: 'grok',
    name: 'Grok',
    pathMac: '~/.grok/skills',
    pathLinux: '~/.grok/skills',
    pathWindows: '%USERPROFILE%\\.grok\\skills',
  },
  qwenworkcn: {
    id: 'qwenworkcn',
    name: '千问办公',
    pathMac: '~/.qwenworkcn/skills',
    pathLinux: '~/.qwenworkcn/skills',
    pathWindows: '%USERPROFILE%\\.qwenworkcn\\skills',
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    pathMac: '~/.qwen/skills',
    pathLinux: '~/.qwen/skills',
    pathWindows: '%USERPROFILE%\\.qwen\\skills',
  },
};
