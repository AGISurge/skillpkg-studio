const path = require('path');
const fs = require('fs/promises');
const {
  isPathInside,
  normalizeRealPath,
  pathExists,
  readJsonIfExists,
} = require('./pathUtils');

const SKILL_MARKDOWN_FILENAME = 'SKILL.md';

const stripYamlQuotes = (value) => {
  const trimmed = String(value || '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const parseYamlScalarBlock = (lines, startIndex, baseIndent, style) => {
  const blockLines = [];
  let contentIndent = null;
  let nextIndex = startIndex + 1;

  for (; nextIndex < lines.length; nextIndex += 1) {
    const line = lines[nextIndex];
    if (!line.trim()) {
      blockLines.push('');
      continue;
    }

    const indent = line.match(/^\s*/)?.[0].length || 0;
    if (indent <= baseIndent) break;
    contentIndent = contentIndent === null ? indent : Math.min(contentIndent, indent);
    blockLines.push(line);
  }

  const normalizedLines = blockLines.map((line) => (
    line.trim() && contentIndent !== null ? line.slice(contentIndent) : ''
  ));
  const value = style === '>'
    ? normalizedLines.map((line) => line.trim()).filter(Boolean).join(' ')
    : normalizedLines.join('\n');

  return {
    value: value.trim(),
    nextIndex,
  };
};

const parseSimpleYamlMetadata = (yamlContent) => {
  const metadata = {};
  const lines = yamlContent.split(/\r?\n/);

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const match = line.match(/^(\s*)([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
    if (!match) {
      index += 1;
      continue;
    }

    const [, indentText, key, rawValue] = match;
    const normalizedKey = key.toLowerCase();
    const value = rawValue.trim();

    if (value === '|' || value === '>') {
      const block = parseYamlScalarBlock(lines, index, indentText.length, value);
      metadata[normalizedKey] = block.value;
      index = block.nextIndex;
      continue;
    }

    metadata[normalizedKey] = stripYamlQuotes(value);
    index += 1;
  }

  return metadata;
};

const parseSkillMarkdownMetadata = (content) => {
  const metadata = {};
  if (!content) return metadata;
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (frontmatter) {
    Object.assign(metadata, parseSimpleYamlMetadata(frontmatter[1]));
  }
  if (!metadata.name) {
    const heading = content.match(/^#\s+(.+?)\s*$/m);
    if (heading) metadata.name = heading[1].trim();
  }
  if (!metadata.description) {
    const inlineDescription = content.match(/^\s*description\s*:\s*(.+)$/im);
    if (inlineDescription) metadata.description = stripYamlQuotes(inlineDescription[1]);
  }
  if (!metadata.version) {
    const inlineVersion = content.match(/^\s*version\s*:\s*(.+)$/im);
    if (inlineVersion) metadata.version = stripYamlQuotes(inlineVersion[1]);
  }
  return metadata;
};

const hasSkillMarkdown = async (skillDir) => {
  try {
    const entries = await fs.readdir(skillDir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name === SKILL_MARKDOWN_FILENAME);
  } catch (error) {
    return false;
  }
};

const shouldLoadFileContent = (relativePath, mode) => {
  if (mode === 'all') return true;
  if (mode === 'skill-md-only') return relativePath === SKILL_MARKDOWN_FILENAME;
  return false;
};

const collectFiles = async (baseDir, currentDir = baseDir, options = {}) => {
  const contentMode = options.contentMode || 'all';
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      results.push(...await collectFiles(baseDir, fullPath, options));
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/');
    let content = '';
    const contentLoaded = shouldLoadFileContent(relativePath, contentMode);
    if (contentLoaded) {
      try {
        content = await fs.readFile(fullPath, 'utf-8');
      } catch (error) {
        content = '';
      }
    }
    results.push({ path: relativePath, content, contentLoaded });
  }
  return results.sort((a, b) => {
    if (a.path === SKILL_MARKDOWN_FILENAME) return -1;
    if (b.path === SKILL_MARKDOWN_FILENAME) return 1;
    return a.path.localeCompare(b.path);
  });
};

const readSkillFromDir = async (skillDir, skillId, options = {}) => {
  if (!await hasSkillMarkdown(skillDir)) return null;
  const metadataPath = path.join(skillDir, 'skill.json');
  const legacyMetadata = await readJsonIfExists(metadataPath);
  const skillMdPath = path.join(skillDir, SKILL_MARKDOWN_FILENAME);
  const skillMarkdown = await fs.readFile(skillMdPath, 'utf-8').catch(() => '');
  const markdownMetadata = parseSkillMarkdownMetadata(skillMarkdown);
  const files = await collectFiles(skillDir, skillDir, {
    contentMode: options.fileContentMode || 'all',
  });
  return {
    id: skillId,
    name: markdownMetadata.name || legacyMetadata?.name || skillId,
    version: markdownMetadata.version || legacyMetadata?.version || '0.1.0',
    description:
      markdownMetadata.description ||
      legacyMetadata?.description ||
      '未提供描述。',
    author: legacyMetadata?.author || 'Local',
    tags: legacyMetadata?.tags || ['local'],
    files,
    source: options.source || 'library',
    agentId: options.agentId,
    rootPath: skillDir,
    realPath: options.realPath || skillDir,
    linkTarget: options.linkTarget || null,
    managed: Boolean(options.managed),
  };
};

const getDirectoryTargetInfo = async (entryPath, installRootRealPath) => {
  const lstat = await fs.lstat(entryPath);
  const isLinked = lstat.isSymbolicLink();
  const stat = isLinked ? await fs.stat(entryPath).catch(() => null) : lstat;
  if (!stat?.isDirectory()) return null;
  const realPath = await normalizeRealPath(entryPath).catch(() => entryPath);
  const managed =
    Boolean(isLinked && installRootRealPath && isPathInside(realPath, installRootRealPath));
  return {
    isLinked,
    managed,
    realPath,
    linkTarget: isLinked ? realPath : null,
  };
};

const loadSkillsFromPath = async (skillRoot, options = {}) => {
  if (!skillRoot || !await pathExists(skillRoot)) return [];
  const installRootRealPath = options.installPath
    ? await normalizeRealPath(options.installPath).catch(() => null)
    : null;
  const entries = await fs.readdir(skillRoot, { withFileTypes: true }).catch(() => []);
  const skills = [];
  for (const entry of entries) {
    const entryPath = path.join(skillRoot, entry.name);
    const targetInfo = await getDirectoryTargetInfo(entryPath, installRootRealPath).catch(() => null);
    if (!targetInfo) continue;
    const source =
      options.mode === 'agent'
        ? targetInfo.managed ? 'managed' : 'agent'
        : 'library';
    const skill = await readSkillFromDir(entryPath, entry.name, {
      agentId: options.agentId,
      source,
      managed: targetInfo.managed,
      realPath: targetInfo.realPath,
      linkTarget: targetInfo.linkTarget,
      fileContentMode: options.fileContentMode || (options.mode === 'agent' ? 'skill-md-only' : 'all'),
    });
    if (skill) skills.push(skill);
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
};

module.exports = {
  SKILL_MARKDOWN_FILENAME,
  collectFiles,
  hasSkillMarkdown,
  loadSkillsFromPath,
  parseSkillMarkdownMetadata,
  readSkillFromDir,
};
