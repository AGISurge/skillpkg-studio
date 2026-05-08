import type { Skill, SkillFile } from '../types/models';

/**
 * 文件后缀到语法高亮语言的映射。
 */
const FILE_LANGUAGE_MAP: Record<string, string> = {
  bash: 'bash',
  c: 'cpp',
  conf: 'ini',
  cpp: 'cpp',
  cs: 'csharp',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  swift: 'swift',
  toml: 'toml',
  yaml: 'yaml',
  yml: 'yaml',
  css: 'css',
  html: 'html',
  xml: 'xml',
};

const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;
const MAX_TEXT_EDIT_BYTES = 512 * 1024;
const MAX_IMAGE_PREVIEW_BYTES = 5 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  'bash',
  'c',
  'conf',
  'cpp',
  'cs',
  'css',
  'csv',
  'env',
  'go',
  'h',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsx',
  'kt',
  'log',
  'lua',
  'mjs',
  'md',
  'mdx',
  'php',
  'plist',
  'properties',
  'py',
  'rb',
  'rs',
  'sh',
  'sql',
  'swift',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
]);

const TEXT_FILENAMES = new Set([
  '.gitignore',
  '.npmignore',
  'dockerfile',
  'license',
  'makefile',
  'notice',
  'readme',
]);

const IMAGE_MIME_TYPES: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

export type FilePolicy = {
  kind: 'text' | 'image' | 'binary';
  mimeType: string;
  canLoad: boolean;
  canPreview: boolean;
  canEdit: boolean;
  reason: string | null;
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

const getNormalizedFilename = (filePath: string): string =>
  filePath.split('/').pop()?.toLowerCase() || '';

const isTextFilePath = (filePath: string): boolean => {
  const extension = getExtension(filePath);
  if (TEXT_EXTENSIONS.has(extension)) return true;
  return TEXT_FILENAMES.has(getNormalizedFilename(filePath));
};

export const formatBytes = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '未知大小';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

export const getFilePolicy = (file?: SkillFile | null): FilePolicy => {
  const filePath = file?.path || '';
  const extension = getExtension(filePath);
  const size = file?.size;
  const hasKnownSize = typeof size === 'number' && !Number.isNaN(size);
  const normalizedSize = hasKnownSize ? size : 0;

  if (file?.kind === 'image' || IMAGE_MIME_TYPES[extension]) {
    const canLoad = !hasKnownSize || normalizedSize <= MAX_IMAGE_PREVIEW_BYTES;
    return {
      kind: 'image',
      mimeType: file?.mimeType || IMAGE_MIME_TYPES[extension] || 'image/*',
      canLoad,
      canPreview: canLoad,
      canEdit: false,
      reason: canLoad ? null : 'image-too-large',
    };
  }

  if (file?.kind === 'text' || isTextFilePath(filePath)) {
    const canPreview = !hasKnownSize || normalizedSize <= MAX_TEXT_PREVIEW_BYTES;
    return {
      kind: 'text',
      mimeType: file?.mimeType || 'text/plain',
      canLoad: canPreview,
      canPreview,
      canEdit: !hasKnownSize || normalizedSize <= MAX_TEXT_EDIT_BYTES,
      reason: canPreview ? null : 'text-too-large',
    };
  }

  return {
    kind: 'binary',
    mimeType: file?.mimeType || 'application/octet-stream',
    canLoad: false,
    canPreview: false,
    canEdit: false,
    reason: file?.loadReason || 'unsupported-file-type',
  };
};

export const getFilePolicyMessage = (file?: SkillFile | null): string => {
  if (!file) return '请选择一个文件。';
  const reason = file.loadReason || getFilePolicy(file).reason;
  const sizeText = formatBytes(file.size);
  if (reason === 'text-too-large') {
    return `文本文件过大（${sizeText}），已停止加载以避免界面卡顿。`;
  }
  if (reason === 'image-too-large') {
    return `图片文件过大（${sizeText}），已停止预览以避免内存占用过高。`;
  }
  if (reason === 'read-failed') return '文件读取失败。';
  if (reason === 'invalid-path') return '文件路径无效，已阻止加载。';
  return `此文件类型不支持预览或编辑${file.size !== undefined ? `（${sizeText}）` : ''}。`;
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
  if (getFilePolicy(file).kind !== 'text') return '';
  const isMarkdown = getExtension(file.path) === 'md';
  if (isMarkdown) return file.content;
  const language = getLanguage(file.path);
  return `\`\`\`${language}\n${file.content}\n\`\`\``;
};
