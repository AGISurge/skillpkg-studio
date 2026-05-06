const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron/main');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const isDev = require('electron-is-dev');
const initSqlJs = require('sql.js');
const {
  ensureDir,
  pathExists,
  removeIfExists,
} = require('./electron/pathUtils');
const { getAgentConfig, resolveAgentSkillPath } = require('./electron/agentCatalog');
const {
  ensureAgentSkillLink,
  listInstalledAgents,
  loadAgentSkills,
  uninstallAgentSkillLink,
} = require('./electron/agentService');
const {
  SKILL_MARKDOWN_FILENAME,
  hasSkillMarkdown,
  loadSkillsFromPath,
  parseSkillMarkdownMetadata,
} = require('./electron/skillScanner');

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
  win.loadURL(urlLocation);
};

const getDefaultInstallPath = () =>
  path.join(os.homedir(), '.skillpkg', 'skills');

let db = null;
let dbInitError = null;
let dbSaveQueue = Promise.resolve();

const getDatabasePath = () =>
  path.join(app.getPath('userData'), 'skillpkg.sqlite');

const saveDatabase = async () => {
  if (!db) return;
  const dbPath = getDatabasePath();
  dbSaveQueue = dbSaveQueue
    .then(async () => {
      await ensureDir(path.dirname(dbPath));
      const data = db.export();
      await fs.writeFile(dbPath, Buffer.from(data));
    })
    .catch(() => {});
  return dbSaveQueue;
};

const initDatabase = async () => {
  try {
    const dbPath = getDatabasePath();
    const SQL = await initSqlJs();
    const existing = await fs.readFile(dbPath).catch(() => null);
    db = existing && existing.length
      ? new SQL.Database(new Uint8Array(existing))
      : new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS skill_agent_link (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skillId TEXT NOT NULL,
        agentId TEXT NOT NULL,
        version TEXT,
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(skillId, agentId)
      );
    `);
    await saveDatabase();
  } catch (error) {
    dbInitError = error;
    console.error('Database init failed:', error);
  }
};

const getDatabaseInfo = () => ({
  path: getDatabasePath(),
  ok: Boolean(db) && !dbInitError,
  error: dbInitError ? String(dbInitError.message || dbInitError) : null,
});

const upsertSkillInstallRecord = async ({
  skillId,
  agentId,
  version,
  description,
}) => {
  if (!db || dbInitError) return;
  db.run(
    `
    INSERT INTO skill_agent_link (skillId, agentId, version, description)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(skillId, agentId)
    DO UPDATE SET version = excluded.version, description = excluded.description;
  `,
    [skillId, agentId, version || null, description || null],
  );
  await saveDatabase();
};

const listSkillInstallRecords = (filters) => {
  if (!db || dbInitError) return [];
  const conditions = [];
  const values = [];
  if (filters?.skillId) {
    conditions.push('skillId = ?');
    values.push(filters.skillId);
  }
  if (filters?.agentId) {
    conditions.push('agentId = ?');
    values.push(filters.agentId);
  }
  const whereClause = conditions.length
    ? ` WHERE ${conditions.join(' AND ')}`
    : '';
  const query = `SELECT id, skillId, agentId, version, description FROM skill_agent_link${whereClause} ORDER BY id DESC`;
  const stmt = db.prepare(query);
  stmt.bind(values);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
};

const getSkillMarkdownMetadata = async (skillDir) => {
  const content = await fs
    .readFile(path.join(skillDir, SKILL_MARKDOWN_FILENAME), 'utf-8')
    .catch(() => '');
  return parseSkillMarkdownMetadata(content);
};

const ensureSkillMarkdownFile = async (skillDir, skill) => {
  const skillMdPath = path.join(skillDir, SKILL_MARKDOWN_FILENAME);
  if (await pathExists(skillMdPath)) return;
  const content = [
    '---',
    `name: ${skill.name || skill.id}`,
    `description: ${skill.description || ''}`,
    `version: ${skill.version || '0.1.0'}`,
    '---',
    '',
    `# ${skill.name || skill.id}`,
    '',
    skill.description || '',
    '',
  ].join('\n');
  await fs.writeFile(skillMdPath, content);
};

const writeSkillToLibrary = async ({ installPath, skill, overwrite }) => {
  const skillDir = path.join(installPath, skill.id);
  if (await pathExists(skillDir)) {
    if (!overwrite && await hasSkillMarkdown(skillDir)) {
      return { ok: true, skillDir };
    }
    if (!overwrite) return { ok: false, reason: 'exists', skillDir };
    await removeIfExists(skillDir);
  }
  await ensureDir(skillDir);
  const metadata = {
    name: skill.name,
    version: skill.version,
    description: skill.description,
    author: skill.author,
    tags: skill.tags,
  };
  await fs.writeFile(
    path.join(skillDir, 'skill.json'),
    JSON.stringify(metadata, null, 2),
  );
  await Promise.all(
    (skill.files || []).map(async (file) => {
      const targetPath = path.join(skillDir, ...file.path.split('/'));
      await ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, file.content || '');
    }),
  );
  await ensureSkillMarkdownFile(skillDir, skill);
  return { ok: true, skillDir };
};

const registerIpcHandlers = () => {
  ipcMain.handle('get-default-install-path', async () => getDefaultInstallPath());

  ipcMain.handle('select-install-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths?.[0] || null;
  });

  ipcMain.handle('get-agent-skill-counts', async (_event, payload) => {
    const { agents, installPath } = payload || {};
    const results = await loadAgentSkills({ agents: agents || [], installPath });
    return results.reduce((acc, result) => {
      acc[result.agentId] = result.skills.length;
      return acc;
    }, {});
  });

  ipcMain.handle('load-skills', async (_event, installPath) =>
    loadSkillsFromPath(installPath, { mode: 'library' }));

  ipcMain.handle('install-skill', async (_event, payload) => {
    const { installPath, skill, agents, overwrite } = payload || {};
    if (!installPath || !skill?.id) return { ok: false, reason: 'invalid' };
    const agentList = Array.isArray(agents) ? agents : [];
    if (!agentList.length) return { ok: false, reason: 'no-agents' };
    await ensureDir(installPath);
    const libraryResult = await writeSkillToLibrary({ installPath, skill, overwrite });
    if (!libraryResult.ok) return libraryResult;
    const installResults = await Promise.all(
      agentList.map(async (agent) => {
        try {
          return await ensureAgentSkillLink({
            agent,
            skillId: skill.id,
            targetDir: libraryResult.skillDir,
          });
        } catch (error) {
          return { agentId: agent.id, ok: false, reason: 'link-failed' };
        }
      }),
    );
    const failed = installResults.find((result) => !result.ok);
    if (failed) return { ok: false, reason: failed.reason, results: installResults };
    const markdownMetadata = await getSkillMarkdownMetadata(libraryResult.skillDir);
    for (const result of installResults) {
      await upsertSkillInstallRecord({
        skillId: skill.id,
        agentId: result.agentId,
        version: markdownMetadata.version || skill.version || null,
        description: markdownMetadata.description || skill.description || null,
      });
    }
    return { ok: true, results: installResults };
  });

  ipcMain.handle('uninstall-agent-skill', async (_event, payload) => {
    const { agentId, skillId, installPath } = payload || {};
    if (!agentId || !skillId) return { ok: false, reason: 'invalid' };
    return uninstallAgentSkillLink({
      agent: getAgentConfig(agentId),
      skillId,
      installPath,
    });
  });

  ipcMain.handle('load-skill-install-records', async (_event, filters) =>
    listSkillInstallRecords(filters));

  ipcMain.handle('get-db-info', async () => getDatabaseInfo());

  ipcMain.handle('save-skill-file', async (_event, payload) => {
    const { installPath, skillId, filePath, content, rootPath } = payload || {};
    if (!filePath) return false;
    const basePath = rootPath || (installPath && skillId ? path.join(installPath, skillId) : null);
    if (!basePath) return false;
    const targetPath = path.join(basePath, ...filePath.split('/'));
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, content || '');
    return true;
  });

  ipcMain.handle('load-agent-skills', async (_event, payload) => {
    const legacyAgents = Array.isArray(payload) ? payload : null;
    const agents = legacyAgents || payload?.agents || [];
    const installPath = legacyAgents ? getDefaultInstallPath() : payload?.installPath;
    return loadAgentSkills({ agents, installPath });
  });

  ipcMain.handle('migrate-skills', async (_event, payload) => {
    const { installPath, items } = payload || {};
    if (!installPath || !Array.isArray(items) || !items.length) return [];
    await ensureDir(installPath);
    const results = await Promise.all(
      items.map(async (item) => {
        const sourcePath = getAgentConfig(item.agentId)
          ? resolveAgentSkillPath(item.agentId)
          : null;
        if (!sourcePath) {
          return {
            agentId: item.agentId,
            skillId: item.skillId,
            ok: false,
            reason: 'source-missing',
          };
        }
        const sourceDir = path.join(sourcePath, item.skillId);
        if (!await pathExists(sourceDir)) {
          return {
            agentId: item.agentId,
            skillId: item.skillId,
            ok: false,
            reason: 'skill-missing',
          };
        }
        const targetDir = path.join(installPath, item.skillId);
        try {
          await fs.cp(sourceDir, targetDir, { recursive: true, force: true });
          return { agentId: item.agentId, skillId: item.skillId, ok: true };
        } catch (error) {
          return {
            agentId: item.agentId,
            skillId: item.skillId,
            ok: false,
            reason: 'copy-failed',
          };
        }
      }),
    );
    return results;
  });

  ipcMain.handle('open-skill-path', async (_event, payload) => {
    const { installPath, skillId, rootPath } = payload || {};
    const targetDir = rootPath || (installPath && skillId ? path.join(installPath, skillId) : null);
    if (!targetDir || !await pathExists(targetDir)) return false;
    shell.showItemInFolder(targetDir);
    return true;
  });

  ipcMain.handle('detect-agents', async (_event, names) =>
    listInstalledAgents(Array.isArray(names) ? names : names ? [names] : []));
};

app.on('ready', async () => {
  await initDatabase();
  createWindow();
  registerIpcHandlers();

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
