import type { Agent } from '../types/models';

/**
 * 支持的 Agent 标识列表（固定展示顺序）。
 */
export const AGENT_TOOL_IDS = ['claude', 'codex', 'cursor'] as const;

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
    name: 'Claude',
    pathMac: '~/.claude/skills',
    pathWindows: '%USERPROFILE%\\.claude\\skills',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    pathMac: '~/.codex/skills',
    pathWindows: '%USERPROFILE%\\.codex\\skills',
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    pathMac: '~/.cursor/skills',
    pathWindows: '%USERPROFILE%\\.cursor\\skills',
  },
};
