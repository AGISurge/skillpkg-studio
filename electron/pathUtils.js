const path = require('path');
const os = require('os');
const fs = require('fs/promises');

const ensureDir = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const pathExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
};

const readJsonIfExists = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const removeIfExists = async (targetPath) => {
  try {
    await fs.lstat(targetPath);
  } catch (error) {
    return;
  }
  await fs.rm(targetPath, { recursive: true, force: true });
};

const getDefaultSkillLibraryPath = (options = {}) => {
  const platform = options.platform || os.platform();
  const homeDir = options.homeDir ?? os.homedir();
  if (platform === 'win32') {
    const envAppData = Object.prototype.hasOwnProperty.call(options.env || {}, 'APPDATA')
      ? options.env.APPDATA
      : process.env.APPDATA;
    const appDataPath = options.appDataPath || envAppData;
    const fallbackAppDataPath = homeDir ? path.join(homeDir, 'AppData', 'Roaming') : null;
    const basePath = appDataPath || fallbackAppDataPath;
    return basePath ? path.join(basePath, 'skillpkg', 'skills') : null;
  }
  return homeDir ? path.join(homeDir, '.skillpkg', 'skills') : null;
};

const getLegacySkillLibraryPath = (options = {}) => {
  const homeDir = options.homeDir ?? os.homedir();
  return homeDir ? path.join(homeDir, 'skillpkg', 'skills') : null;
};

const resolveTemplatePath = (template) => {
  if (!template || typeof template !== 'string') return null;
  let resolved = template;
  const homeDir = os.homedir();
  if (resolved === '~') {
    if (!homeDir) return null;
    resolved = homeDir;
  } else if (resolved.startsWith('~/')) {
    if (!homeDir) return null;
    resolved = path.join(homeDir, resolved.slice(2));
  }
  const replacements = {
    '%USERPROFILE%': process.env.USERPROFILE || homeDir || '',
    '%APPDATA%': process.env.APPDATA || '',
    '%LOCALAPPDATA%': process.env.LOCALAPPDATA || '',
    '%PROGRAMFILES%': process.env.PROGRAMFILES || '',
  };
  Object.entries(replacements).forEach(([token, value]) => {
    if (value) {
      resolved = resolved.replace(new RegExp(token, 'gi'), value);
    }
  });
  return path.normalize(resolved);
};

const normalizeRealPath = async (targetPath) => {
  const realPath = await fs.realpath(targetPath);
  return path.normalize(realPath);
};

const isPathInside = (childPath, parentPath) => {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === '' || Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
};

module.exports = {
  ensureDir,
  getDefaultSkillLibraryPath,
  getLegacySkillLibraryPath,
  isPathInside,
  normalizeRealPath,
  pathExists,
  readJsonIfExists,
  removeIfExists,
  resolveTemplatePath,
};
