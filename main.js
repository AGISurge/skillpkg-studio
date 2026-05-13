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
const { getFilePolicy } = require('./electron/filePolicy');
const { getAgentConfig, resolveAgentSkillPath } = require('./electron/agentCatalog');
const {
  ensureAgentSkillLink,
  listInstalledAgents,
  loadAgentSkills,
  unhostAgentSkillLink,
  uninstallAgentSkillLink,
} = require('./electron/agentService');
const {
  SKILL_MARKDOWN_FILENAME,
  hasSkillMarkdown,
  loadSkillsFromPath,
  parseSkillMarkdownMetadata,
} = require('./electron/skillScanner');
const { importSkillSource } = require('./electron/importService');

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    minWidth: 1280,
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

const getImportTempRoot = () =>
  path.join(app.getPath('temp'), 'skillpkg-studio', 'imports');

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
    db.run(`
      CREATE TABLE IF NOT EXISTS skill_favorite (
        skillId TEXT PRIMARY KEY,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
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

const deleteSkillInstallRecord = async ({ skillId, agentId }) => {
  if (!db || dbInitError) return;
  db.run('DELETE FROM skill_agent_link WHERE skillId = ? AND agentId = ?;', [
    skillId,
    agentId,
  ]);
  await saveDatabase();
};

const listFavoriteSkillIds = () => {
  if (!db || dbInitError) return [];
  const stmt = db.prepare(
    'SELECT skillId FROM skill_favorite ORDER BY createdAt DESC, skillId ASC;',
  );
  const rows = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (typeof row.skillId === 'string') rows.push(row.skillId);
  }
  stmt.free();
  return rows;
};

const replaceFavoriteSkillIds = async (skillIds) => {
  if (!db || dbInitError) return { ok: false, reason: 'db-unavailable' };
  const normalizedSkillIds = Array.isArray(skillIds)
    ? [...new Set(skillIds.filter((skillId) => typeof skillId === 'string' && skillId.trim()))]
    : [];

  try {
    db.run('BEGIN TRANSACTION;');
    db.run('DELETE FROM skill_favorite;');
    const stmt = db.prepare(
      'INSERT INTO skill_favorite (skillId) VALUES (?);',
    );
    try {
      normalizedSkillIds.forEach((skillId) => stmt.run([skillId]));
    } finally {
      stmt.free();
    }
    db.run('COMMIT;');
    await saveDatabase();
    return { ok: true };
  } catch (error) {
    try {
      db.run('ROLLBACK;');
    } catch (_rollbackError) {}
    return { ok: false, reason: 'save-failed' };
  }
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

const copySkillDirIntoLibrary = async ({ sourceDir, targetDir, installPath }) => {
  const sourceRealPath = await fs.realpath(sourceDir).catch(() => sourceDir);
  const tempDir = path.join(
    installPath,
    `.${path.basename(targetDir)}.${process.pid}.${Date.now()}.tmp`,
  );
  await removeIfExists(tempDir);
  await fs.cp(sourceRealPath, tempDir, { recursive: true, force: true });
  if (!await hasSkillMarkdown(tempDir)) {
    await removeIfExists(tempDir);
    return { ok: false, reason: 'invalid-skill' };
  }
  await removeIfExists(targetDir);
  await fs.rename(tempDir, targetDir);
  return { ok: true };
};

const migrateAgentSkillToLibrary = async ({
  installPath,
  item,
  overwrite,
  useExisting,
}) => {
  const agentConfig = getAgentConfig(item.agentId);
  const agentSkillPath = agentConfig ? resolveAgentSkillPath(agentConfig) : null;
  const sourceRoot = item.rootPath || (
    agentSkillPath ? path.join(agentSkillPath, item.skillId) : null
  );
  if (!sourceRoot) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: false,
      reason: 'source-missing',
    };
  }
  if (!await pathExists(sourceRoot)) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: false,
      reason: 'skill-missing',
    };
  }
  const targetDir = path.join(installPath, item.skillId);
  const targetExists = await pathExists(targetDir);
  const targetLstat = targetExists ? await fs.lstat(targetDir).catch(() => null) : null;
  const targetIsSymlink = Boolean(targetLstat?.isSymbolicLink());
  if (targetExists && !targetIsSymlink && !overwrite && !useExisting) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: false,
      reason: 'exists',
    };
  }
  if (useExisting && !targetIsSymlink) {
    if (!await hasSkillMarkdown(targetDir)) {
      return {
        agentId: item.agentId,
        skillId: item.skillId,
        ok: false,
        reason: 'invalid-managed-skill',
      };
    }
  } else {
    const copyResult = await copySkillDirIntoLibrary({
      sourceDir: sourceRoot,
      targetDir,
      installPath,
    });
    if (!copyResult.ok) {
      return {
        agentId: item.agentId,
        skillId: item.skillId,
        ok: false,
        reason: copyResult.reason,
      };
    }
  }
  await removeIfExists(sourceRoot);
  const linkResult = await ensureAgentSkillLink({
    agent: agentConfig,
    skillId: item.skillId,
    targetDir,
  });
  if (!linkResult.ok) {
    return {
      agentId: item.agentId,
      skillId: item.skillId,
      ok: false,
      reason: linkResult.reason,
    };
  }
  const markdownMetadata = await getSkillMarkdownMetadata(targetDir);
  await upsertSkillInstallRecord({
    skillId: item.skillId,
    agentId: item.agentId,
    version: markdownMetadata.version || null,
    description: markdownMetadata.description || null,
  });
  return { agentId: item.agentId, skillId: item.skillId, ok: true };
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

  ipcMain.handle('select-import-zip', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Zip archives', extensions: ['zip'] }],
    });
    if (result.canceled) return null;
    return result.filePaths?.[0] || null;
  });

  ipcMain.handle('scan-import-candidates', async (_event, payload) => {
    const { scanImportCandidates } = require('./electron/importService');
    return scanImportCandidates(payload || {});
  });

  ipcMain.handle('import-skill-source', async (_event, payload) =>
    importSkillSource({
      ...(payload || {}),
      tempRoot: getImportTempRoot(),
    }));

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

  ipcMain.handle('unhost-agent-skill', async (_event, payload) => {
    const { agentId, skillId, installPath } = payload || {};
    if (!agentId || !skillId) return { ok: false, reason: 'invalid' };
    const result = await unhostAgentSkillLink({
      agent: getAgentConfig(agentId),
      skillId,
      installPath,
    });
    if (result.ok) {
      await deleteSkillInstallRecord({ skillId, agentId });
    }
    return result;
  });

  ipcMain.handle('load-skill-install-records', async (_event, filters) =>
    listSkillInstallRecords(filters));

  ipcMain.handle('load-favorite-skill-ids', async () => listFavoriteSkillIds());

  ipcMain.handle('replace-favorite-skill-ids', async (_event, skillIds) =>
    replaceFavoriteSkillIds(skillIds));

  ipcMain.handle('get-db-info', async () => getDatabaseInfo());

  ipcMain.handle('save-skill-file', async (_event, payload) => {
    const { installPath, skillId, filePath, content, rootPath } = payload || {};
    if (!filePath) return false;
    const basePath = rootPath || (installPath && skillId ? path.join(installPath, skillId) : null);
    if (!basePath) return false;
    const targetPath = path.normalize(path.join(basePath, ...filePath.split('/')));
    const relative = path.relative(basePath, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
    const policy = getFilePolicy(filePath, Buffer.byteLength(content || '', 'utf-8'));
    if (!policy.canEdit) return false;
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, content || '');
    return true;
  });

  ipcMain.handle('load-skill-file', async (_event, payload) => {
    const { rootPath, filePath } = payload || {};
    if (!rootPath || !filePath) return { ok: false, reason: 'invalid' };
    const targetPath = path.normalize(path.join(rootPath, ...filePath.split('/')));
    const relative = path.relative(rootPath, targetPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { ok: false, reason: 'invalid-path' };
    }
    try {
      const stat = await fs.stat(targetPath);
      const policy = getFilePolicy(filePath, stat.size);
      if (!policy.canLoad) {
        return {
          ok: false,
          reason: policy.reason,
          size: stat.size,
          kind: policy.kind,
          mimeType: policy.mimeType,
        };
      }
      if (policy.kind === 'image') {
        const buffer = await fs.readFile(targetPath);
        return {
          ok: true,
          content: `data:${policy.mimeType};base64,${buffer.toString('base64')}`,
          size: stat.size,
          kind: policy.kind,
          mimeType: policy.mimeType,
        };
      }
      const content = await fs.readFile(targetPath, 'utf-8');
      return {
        ok: true,
        content,
        size: stat.size,
        kind: policy.kind,
        mimeType: policy.mimeType,
      };
    } catch (error) {
      return { ok: false, reason: 'read-failed' };
    }
  });

  ipcMain.handle('load-agent-skills', async (_event, payload) => {
    const legacyAgents = Array.isArray(payload) ? payload : null;
    const agents = legacyAgents || payload?.agents || [];
    const installPath = legacyAgents ? getDefaultInstallPath() : payload?.installPath;
    return loadAgentSkills({ agents, installPath });
  });

  ipcMain.handle('migrate-skills', async (_event, payload) => {
    const { installPath, items, overwrite, useExisting } = payload || {};
    if (!installPath || !Array.isArray(items) || !items.length) return [];
    await ensureDir(installPath);
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          return await migrateAgentSkillToLibrary({
            installPath,
            item,
            overwrite: Boolean(overwrite),
            useExisting: Boolean(useExisting),
          });
        } catch (error) {
          return {
            agentId: item.agentId,
            skillId: item.skillId,
            ok: false,
            reason: 'migrate-failed',
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
