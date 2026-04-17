import type { Skill, SkillFile } from '../types/models';

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

export type TreeNode = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children: Record<string, TreeNode>;
};

export const getExtension = (filePath: string): string => {
  const segments = filePath.split('.');
  return segments.length > 1 ? segments[segments.length - 1].toLowerCase() : '';
};

export const getLanguage = (filePath: string): string => {
  return FILE_LANGUAGE_MAP[getExtension(filePath)] || 'plaintext';
};

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

export const validateSkill = (skill: Skill | null): boolean => {
  if (!skill || !skill.name || !skill.version) return false;
  if (!Array.isArray(skill.files) || skill.files.length === 0) return false;
  return skill.files.every((file) => file.path && typeof file.content === 'string');
};

export const getMarkdownContent = (file?: SkillFile | null): string => {
  if (!file) return '';
  const isMarkdown = getExtension(file.path) === 'md';
  if (isMarkdown) return file.content;
  const language = getLanguage(file.path);
  return `\`\`\`${language}\n${file.content}\n\`\`\``;
};
