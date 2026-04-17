export type SkillFile = {
  path: string;
  content: string;
};

export type Skill = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  files: SkillFile[];
};

export type Agent = {
  id: string;
  name: string;
  pathMac: string;
  pathWindows: string;
};
