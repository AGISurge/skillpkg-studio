const { app, BrowserWindow, ipcMain, dialog } = require('electron/main');
const path = require('path');
const fs = require('fs/promises');
const isDev = require('electron-is-dev');
const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  const urlLocation = isDev
    ? 'http://localhost:3000'
    : `file://${__dirname}/index.html`;
  // win.loadFile('index.html');
  win.loadURL(urlLocation);
};

const ensureDir = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

const readJsonIfExists = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const collectFiles = async (baseDir, currentDir = baseDir) => {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(baseDir, fullPath)));
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      if (relativePath === 'skill.json') continue;
      let content = '';
      try {
        content = await fs.readFile(fullPath, 'utf-8');
      } catch (error) {
        content = '';
      }
      results.push({ path: relativePath, content });
    }
  }
  return results;
};

const readSkillFromDir = async (skillDir, skillId) => {
  const metadataPath = path.join(skillDir, 'skill.json');
  const metadata = await readJsonIfExists(metadataPath);
  const files = await collectFiles(skillDir);
  return {
    id: skillId,
    name: metadata?.name || skillId,
    version: metadata?.version || '0.1.0',
    description: metadata?.description || '从统一路径加载的 Skill。',
    author: metadata?.author || 'Local',
    tags: metadata?.tags || ['local'],
    files,
  };
};

app.on('ready', () => {
  createWindow();

  ipcMain.handle('select-install-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths?.[0] || null;
  });

  ipcMain.handle('load-skills', async (_event, installPath) => {
    if (!installPath) return [];
    try {
      const entries = await fs.readdir(installPath, { withFileTypes: true });
      const skills = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => readSkillFromDir(path.join(installPath, entry.name), entry.name))
      );
      return skills;
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle('install-skill', async (_event, payload) => {
    const { installPath, skill } = payload || {};
    if (!installPath || !skill?.id) return false;
    const skillDir = path.join(installPath, skill.id);
    await ensureDir(skillDir);
    const metadata = {
      name: skill.name,
      version: skill.version,
      description: skill.description,
      author: skill.author,
      tags: skill.tags,
    };
    await fs.writeFile(path.join(skillDir, 'skill.json'), JSON.stringify(metadata, null, 2));
    await Promise.all(
      (skill.files || []).map(async (file) => {
        const targetPath = path.join(skillDir, ...file.path.split('/'));
        await ensureDir(path.dirname(targetPath));
        await fs.writeFile(targetPath, file.content || '');
      })
    );
    return true;
  });

  ipcMain.handle('save-skill-file', async (_event, payload) => {
    const { installPath, skillId, filePath, content } = payload || {};
    if (!installPath || !skillId || !filePath) return false;
    const targetPath = path.join(installPath, skillId, ...filePath.split('/'));
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, content || '');
    return true;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
