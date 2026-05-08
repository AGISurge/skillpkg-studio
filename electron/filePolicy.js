const path = require('path');

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

const IMAGE_MIME_TYPES = {
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

const getExtension = (filePath) => {
  const ext = path.extname(filePath || '').replace(/^\./, '').toLowerCase();
  return ext;
};

const getNormalizedFilename = (filePath) =>
  path.basename(filePath || '').toLowerCase();

const isTextFilePath = (filePath) => {
  const extension = getExtension(filePath);
  if (TEXT_EXTENSIONS.has(extension)) return true;
  return TEXT_FILENAMES.has(getNormalizedFilename(filePath));
};

const getFilePolicy = (filePath, size = 0) => {
  const extension = getExtension(filePath);
  const normalizedSize = Number.isFinite(size) ? Number(size) : 0;

  if (IMAGE_MIME_TYPES[extension]) {
    const canLoad = normalizedSize <= MAX_IMAGE_PREVIEW_BYTES;
    return {
      kind: 'image',
      mimeType: IMAGE_MIME_TYPES[extension],
      canLoad,
      canPreview: canLoad,
      canEdit: false,
      reason: canLoad ? null : 'image-too-large',
    };
  }

  if (isTextFilePath(filePath)) {
    const canPreview = normalizedSize <= MAX_TEXT_PREVIEW_BYTES;
    return {
      kind: 'text',
      mimeType: 'text/plain',
      canLoad: canPreview,
      canPreview,
      canEdit: normalizedSize <= MAX_TEXT_EDIT_BYTES,
      reason: canPreview ? null : 'text-too-large',
    };
  }

  return {
    kind: 'binary',
    mimeType: 'application/octet-stream',
    canLoad: false,
    canPreview: false,
    canEdit: false,
    reason: 'unsupported-file-type',
  };
};

module.exports = {
  MAX_IMAGE_PREVIEW_BYTES,
  MAX_TEXT_EDIT_BYTES,
  MAX_TEXT_PREVIEW_BYTES,
  getFilePolicy,
};
