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

export type SkillpkgCategory = {
  publicId: string;
  slug: string;
  name: string;
};

export type SkillpkgAuthor = {
  slug: string;
  displayName: string;
  homepage?: string | null;
};

export type SkillpkgPublisher = {
  publicId: string;
  name: string;
  description?: string | null;
  website?: string | null;
};

export type SkillpkgPackageType = 'skill' | 'solution';

export type SkillpkgFileNode = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  bytes?: number;
  children?: SkillpkgFileNode[];
};

export type SkillpkgSkillSummary = {
  publicId: string;
  slug: string;
  type: SkillpkgPackageType;
  name: string;
  description?: string | null;
  category: SkillpkgCategory | null;
  author: SkillpkgAuthor;
  homepage?: string | null;
  riskLevel?: 'benign' | 'suspicious' | 'malicious' | null;
  isFeatured: boolean;
};

export type SkillpkgSkillDetail = SkillpkgSkillSummary & {
  skillMd: string;
  fileStructure: SkillpkgFileNode[];
  version?: string | null;
  downloadCount: number;
  publisher: SkillpkgPublisher | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SkillpkgListMeta = {
  totalDocs: number;
  totalPages: number;
  page: number;
  limit: number;
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
