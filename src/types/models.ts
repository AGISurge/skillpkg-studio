/**
 * 技能文件结构。
 */
export type SkillFile = {
  path: string;
  content: string;
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
   * 技能来源标识：本地目录或统一路径软连接。
   */
  source?: 'local' | 'linked';
};

/**
 * Agent 配置结构。
 */
export type Agent = {
  id: string;
  name: string;
  pathMac: string;
  pathWindows: string;
};
