import type { Skill, SkillFile } from '../types/models';

/**
 * 文件后缀到语法高亮语言的映射。
 */
const FILE_LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  css: 'css',
  html: 'html',
  bash: 'bash',
};

/**
 * 目录树节点结构。
 */
export type TreeNode = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children: Record<string, TreeNode>;
};

/**
 * 获取文件后缀名。
 * @param filePath - 文件路径。
 */
export const getExtension = (filePath: string): string => {
  const segments = filePath.split('.');
  return segments.length > 1 ? segments[segments.length - 1].toLowerCase() : '';
};

/**
 * 根据文件路径获取语法高亮语言。
 * @param filePath - 文件路径。
 */
export const getLanguage = (filePath: string): string => {
  return FILE_LANGUAGE_MAP[getExtension(filePath)] || 'plaintext';
};

/**
 * 将文件列表构建为目录树结构。
 * @param files - 技能文件列表。
 */
export const buildTree = (files: SkillFile[]): TreeNode => {
  const root: TreeNode = { name: '', path: '', children: {}, type: 'folder' };
  files.forEach((file) => {
    const parts = file.path.split('/');
    let current = root;
    parts.forEach((part, index) => {
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          children: {},
          type: index === parts.length - 1 ? 'file' : 'folder',
        };
      }
      current = current.children[part];
    });
  });
  return root;
};

/**
 * 校验技能结构是否完整。
 * @param skill - 待校验的技能对象。
 */
export const validateSkill = (skill: Skill | null): boolean => {
  if (!skill || !skill.name || !skill.version) return false;
  if (!Array.isArray(skill.files) || skill.files.length === 0) return false;
  return (
    skill.files.some((file) => file.path === 'SKILL.md') &&
    skill.files.every((file) => file.path && typeof file.content === 'string')
  );
};

/**
 * 将文件内容包装为 Markdown 展示内容。
 * @param file - 当前选中文件。
 */
export const getMarkdownContent = (file?: SkillFile | null): string => {
  if (!file) return '';
  const isMarkdown = getExtension(file.path) === 'md';
  if (isMarkdown) return file.content;
  const language = getLanguage(file.path);
  return `\`\`\`${language}\n${file.content}\n\`\`\``;
};
