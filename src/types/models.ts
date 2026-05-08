/**
 * 技能文件结构。
 */
export type SkillFile = {
  path: string;
  content: string;
  contentLoaded?: boolean;
  size?: number;
  kind?: 'text' | 'image' | 'binary';
  mimeType?: string;
  loadReason?: string | null;
};

/**
 * 技能对象结构。
 */
export type Skill = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  files: SkillFile[];
  /**
   * 技能来源标识：统一库、SkillPKG 托管链接或 Agent 自有目录。
   */
  source?: 'library' | 'managed' | 'agent';
  agentId?: string;
  rootPath?: string;
  realPath?: string;
  linkTarget?: string | null;
  managed?: boolean;
};

/**
 * Agent 配置结构。
 */
export type Agent = {
  id: string;
  name: string;
  pathMac: string;
  pathWindows: string;
  installed?: boolean;
  reason?: string;
  skillPath?: string | null;
};

export type AgentDetectionResult = {
  id: string;
  name: string;
  installed: boolean;
  reason?: string;
  skillPath?: string | null;
};

export type AgentSkillsResult = {
  agentId: string;
  agentName: string;
  skillPath?: string | null;
  skills: Skill[];
};
