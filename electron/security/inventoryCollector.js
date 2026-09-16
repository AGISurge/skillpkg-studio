const path = require('path');
const fs = require('fs/promises');
const { isPathInside, pathExists } = require('../pathUtils');
const { parseSkillMarkdownMetadata } = require('../skillScanner');
const { POLICY, normalizeFinding } = require('./policyEngine');

const TEXT_EXTENSIONS = new Set([
  'bash', 'c', 'conf', 'cpp', 'cs', 'css', 'csv', 'env', 'go', 'h', 'html',
  'ini', 'java', 'js', 'json', 'jsx', 'kt', 'log', 'lua', 'mjs', 'md', 'mdx',
  'php', 'plist', 'properties', 'ps1', 'py', 'rb', 'rs', 'rst', 'sh', 'sql',
  'svg', 'swift', 'toml', 'ts', 'tsx', 'txt', 'xml', 'yaml', 'yml', 'zsh',
]);
const TEXT_FILENAMES = new Set([
  '.gitignore', '.npmignore', 'dockerfile', 'license', 'makefile', 'notice',
  'readme', 'skill.md',
]);
const STATIC_EXTENSIONS = new Set([
  'apng', 'avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'webp',
  'woff', 'woff2', 'ttf', 'otf', 'mp3', 'mp4', 'wav', 'mov',
]);
const ARCHIVE_EXTENSIONS = new Set([
  'zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'jar', 'whl',
]);
const EXECUTABLE_EXTENSIONS = new Set([
  'exe', 'dll', 'dylib', 'so', 'bin', 'app', 'msi', 'dmg', 'com', 'scr',
]);

const getExtension = (filePath) => path.extname(filePath).slice(1).toLowerCase();
const normalizeRelativePath = (basePath, targetPath) =>
  path.relative(basePath, targetPath).split(path.sep).join('/');

const readTextPrefix = async (filePath, maxBytes = 1024 * 1024) => {
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    await handle.read(buffer, 0, buffer.length, 0);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
};

const classifyFile = (filePath) => {
  const extension = getExtension(filePath);
  const filename = path.basename(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension) || TEXT_FILENAMES.has(filename)) return 'text';
  if (STATIC_EXTENSIONS.has(extension)) return 'static';
  if (ARCHIVE_EXTENSIONS.has(extension)) return 'archive';
  if (EXECUTABLE_EXTENSIONS.has(extension)) return 'executable';
  return 'unknown';
};

const structuralFinding = ({
  ruleId,
  title,
  severity = 'low',
  filePath = '',
  evidence = '',
  message,
  remediation,
  features = [],
  startLine = 1,
  startColumn = 1,
  endLine = startLine,
  endColumn = startColumn,
}) => normalizeFinding({
  ruleId,
  title,
  category: 'package-structure',
  severity,
  confidence: 'high',
  filePath,
  startLine,
  endLine,
  startColumn,
  endColumn,
  evidence,
  message,
  remediation,
  features,
});

const discoverSkillEntries = async (installPath) => {
  if (!installPath || !await pathExists(installPath)) return [];
  const libraryRealPath = await fs.realpath(installPath);
  const entries = await fs.readdir(installPath, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const entryPath = path.join(installPath, entry.name);
    const lstat = await fs.lstat(entryPath).catch(() => null);
    if (!lstat) continue;
    const realPath = await fs.realpath(entryPath).catch(() => null);
    if (!realPath) continue;
    const stat = await fs.stat(realPath).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const skillMdPath = path.join(realPath, 'SKILL.md');
    const skillMdStat = await fs.stat(skillMdPath).catch(() => null);
    if (!skillMdStat?.isFile()) continue;
    const markdown = await readTextPrefix(skillMdPath).catch(() => '');
    const metadata = parseSkillMarkdownMetadata(markdown);
    skills.push({
      skillId: entry.name,
      name: metadata.name || entry.name,
      markdown,
      entryPath,
      realPath,
      rootIsSymlink: lstat.isSymbolicLink(),
      rootOutsideLibrary: !isPathInside(realPath, libraryRealPath),
    });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
};

const collectSkillInventory = async (skill, options = {}) => {
  const limits = options.limits || POLICY.limits;
  const files = [];
  const findings = [];
  let coverage = 'complete';
  let totalBytes = 0;
  let stopped = false;

  if (skill.rootIsSymlink) {
    findings.push(structuralFinding({
      ruleId: skill.rootOutsideLibrary ? 'STRUCTURE_EXTERNAL_ROOT_LINK' : 'STRUCTURE_ROOT_LINK',
      title: skill.rootOutsideLibrary ? '技能链接指向统一库之外' : '技能根目录为符号链接',
      severity: 'low',
      filePath: '',
      evidence: `${skill.entryPath} -> ${skill.realPath}`,
      message: skill.rootOutsideLibrary
        ? '统一库中的技能实际来自库外目录，内容可在 Studio 之外变化。'
        : '技能通过符号链接引用其他目录。',
      remediation: '将技能复制到统一库的普通目录中，或确认链接目标受信任。',
      features: ['external-link'],
    }));
  }

  const stopForLimit = (ruleId, title, message, evidence) => {
    if (stopped) return;
    stopped = true;
    coverage = 'incomplete';
    findings.push(structuralFinding({
      ruleId,
      title,
      severity: 'low',
      evidence,
      message,
      remediation: '精简技能包或调整大文件后重新扫描。',
    }));
  };

  const walk = async (currentPath, depth) => {
    if (stopped) return;
    if (depth > limits.maxDepth) {
      stopForLimit(
        'STRUCTURE_MAX_DEPTH',
        '目录嵌套过深',
        `目录深度超过 ${limits.maxDepth}，剩余内容未扫描。`,
        normalizeRelativePath(skill.realPath, currentPath),
      );
      return;
    }
    const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch((error) => {
      coverage = 'incomplete';
      findings.push(structuralFinding({
        ruleId: 'STRUCTURE_DIRECTORY_READ_FAILED',
        title: '目录无法读取',
        filePath: normalizeRelativePath(skill.realPath, currentPath),
        evidence: error?.code || error?.message || '读取失败',
        message: '无法枚举目录内容，扫描结果不完整。',
        remediation: '检查目录权限后重新扫描。',
      }));
      return [];
    });
    for (const entry of entries) {
      if (stopped) break;
      if (entry.name === '.git' && entry.isDirectory()) continue;
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = normalizeRelativePath(skill.realPath, fullPath);
      const lstat = await fs.lstat(fullPath).catch(() => null);
      if (!lstat) {
        coverage = 'incomplete';
        findings.push(structuralFinding({
          ruleId: 'STRUCTURE_ENTRY_READ_FAILED',
          title: '文件状态无法读取',
          filePath: relativePath,
          evidence: relativePath,
          message: '无法读取文件状态，该文件未完成扫描。',
          remediation: '检查文件权限后重新扫描。',
        }));
        continue;
      }
      if (lstat.isSymbolicLink()) {
        const target = await fs.readlink(fullPath).catch(() => '无法读取目标');
        const resolvedTarget = target === '无法读取目标'
          ? null
          : path.resolve(path.dirname(fullPath), target);
        const targetOutsideSkill = resolvedTarget ? !isPathInside(resolvedTarget, skill.realPath) : true;
        coverage = coverage === 'incomplete' ? coverage : 'partial';
        findings.push(structuralFinding({
          ruleId: targetOutsideSkill ? 'STRUCTURE_EXTERNAL_INTERNAL_LINK' : 'STRUCTURE_INTERNAL_LINK',
          title: targetOutsideSkill ? '内部符号链接指向技能目录之外' : '技能内包含符号链接',
          severity: targetOutsideSkill ? 'high' : 'low',
          filePath: relativePath,
          evidence: `${relativePath} -> ${target}`,
          message: targetOutsideSkill
            ? '内部符号链接未被跟随，且目标超出当前技能目录。'
            : '内部符号链接未被跟随，其目标内容未纳入扫描。',
          remediation: '删除符号链接，将必要文件作为普通文件放入技能目录。',
          features: ['external-link'],
        }));
        continue;
      }
      if (lstat.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }
      if (!lstat.isFile()) continue;
      if (files.length >= limits.maxFilesPerSkill) {
        stopForLimit(
          'STRUCTURE_MAX_FILES',
          '文件数量超过限制',
          `文件数量超过 ${limits.maxFilesPerSkill}，剩余内容未扫描。`,
          relativePath,
        );
        break;
      }
      totalBytes += lstat.size;
      if (totalBytes > limits.maxTotalBytes) {
        stopForLimit(
          'STRUCTURE_MAX_BYTES',
          '技能包总大小超过限制',
          `文件总大小超过 ${limits.maxTotalBytes} 字节，剩余内容未扫描。`,
          relativePath,
        );
        break;
      }
      const kind = classifyFile(relativePath);
      const file = {
        fullPath,
        relativePath,
        size: lstat.size,
        mtimeMs: Math.round(lstat.mtimeMs),
        mode: lstat.mode,
        kind,
      };
      files.push(file);
      options.onFile?.(skill, file);
      if (kind === 'archive') {
        coverage = coverage === 'incomplete' ? coverage : 'partial';
        findings.push(structuralFinding({
          ruleId: 'STRUCTURE_NESTED_ARCHIVE',
          title: '技能内包含未展开的压缩包',
          filePath: relativePath,
          evidence: relativePath,
          message: '第一期不展开技能内的嵌套压缩包。',
          remediation: '移除不必要的压缩包，或展开为可审查的普通文件。',
        }));
      } else if (kind === 'executable') {
        coverage = 'incomplete';
        findings.push(structuralFinding({
          ruleId: 'STRUCTURE_EXECUTABLE_BINARY',
          title: '技能内包含可执行二进制文件',
          severity: 'high',
          filePath: relativePath,
          evidence: relativePath,
          message: '离线基础扫描无法完整审查已编译可执行文件的行为。',
          remediation: '移除可执行二进制，改为可审查源码，或单独审计其来源和签名。',
          features: ['execute'],
        }));
      }
    }
  };

  await walk(skill.realPath, 0);

  const referencedPaths = new Set();
  const markdownLines = String(skill.markdown || '').split(/\r?\n/);
  markdownLines.forEach((line, lineIndex) => {
    const referencePattern = /!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\)/g;
    let match;
    while ((match = referencePattern.exec(line))) {
      const rawReference = match[1] || match[2] || '';
      if (!rawReference || /^(?:https?:|mailto:|data:|#)/i.test(rawReference)) continue;
      let decodedReference = rawReference;
      try { decodedReference = decodeURIComponent(rawReference); } catch (_error) {}
      decodedReference = decodedReference.split(/[?#]/, 1)[0];
      if (!decodedReference || referencedPaths.has(decodedReference)) continue;
      referencedPaths.add(decodedReference);
      const resolvedReference = path.resolve(skill.realPath, decodedReference);
      if (!isPathInside(resolvedReference, skill.realPath)) {
        findings.push(structuralFinding({
          ruleId: 'STRUCTURE_REFERENCE_OUTSIDE_SKILL',
          title: 'SKILL.md 引用了技能目录之外的文件',
          severity: 'low',
          filePath: 'SKILL.md',
          startLine: lineIndex + 1,
          startColumn: match.index + 1,
          endColumn: match.index + match[0].length + 1,
          evidence: `第 ${lineIndex + 1} 行：${rawReference}`,
          message: '该相对引用会离开当前技能目录，可能访问与技能无关的文件。',
          remediation: '将引用目标放入技能目录，并使用不会包含 .. 的相对路径。',
          features: ['scope-drift'],
        }));
        continue;
      }
      const referenceIncluded = files.some((file) => (
        file.fullPath === resolvedReference || file.fullPath.startsWith(`${resolvedReference}${path.sep}`)
      ));
      if (!referenceIncluded) {
        coverage = coverage === 'incomplete' ? coverage : 'partial';
        findings.push(structuralFinding({
          ruleId: 'STRUCTURE_UNRESOLVED_REFERENCE',
          title: 'SKILL.md 引用的文件无法解析',
          filePath: 'SKILL.md',
          startLine: lineIndex + 1,
          startColumn: match.index + 1,
          endColumn: match.index + match[0].length + 1,
          evidence: `第 ${lineIndex + 1} 行：${rawReference}`,
          message: '引用目标不存在、未纳入文件清点，或因扫描限制而不可用。',
          remediation: '修复引用路径并确保目标文件包含在技能包中。',
        }));
      }
    }
  });

  return {
    ...skill,
    files,
    findings,
    coverage,
    totalBytes,
  };
};

module.exports = {
  classifyFile,
  collectSkillInventory,
  discoverSkillEntries,
};
