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

const parseSkillMarkdownMetadata = (content) => {
  const metadata = {};
  if (!content) return metadata;
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (frontmatter) {
    frontmatter[1].split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
      if (match) metadata[match[1].toLowerCase()] = stripYamlQuotes(match[2]);
    });
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

const collectFiles = async (baseDir, currentDir = baseDir) => {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      results.push(...await collectFiles(baseDir, fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/');
    let content = '';
    try {
      content = await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      content = '';
    }
    results.push({ path: relativePath, content });
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
  const files = await collectFiles(skillDir);
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
