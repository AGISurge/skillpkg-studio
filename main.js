const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron/main');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { execFile } = require('child_process');
const isDev = require('electron-is-dev');
const initSqlJs = require('sql.js');

// 全局缓存
const agentInstallStatus = {};

/**
 * 获取当前平台类型
 * @returns 'darwin' | 'win32' | 'other'
 */
const getCurrentPlatform = () => {
  const platform = os.platform();
  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'win32';
  return 'other';
};
/**
 * 创建主窗口。
 */
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

/**
 * 确保目录存在（必要时递归创建）。
 * @param targetPath - 需要创建的目录路径。
 */
const ensureDir = async (targetPath) => {
  await fs.mkdir(targetPath, { recursive: true });
};

/**
 * 读取 JSON 文件，失败时返回 null。
 * @param filePath - JSON 文件绝对路径。
 */
const readJsonIfExists = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const AGENT_APP_BUNDLES = {
  claude: ['Claude.app'],
  codex: ['Codex.app'],
  cursor: ['Cursor.app'],
};

const AGENT_WINDOWS_DISPLAY_NAMES = {
  claude: ['Claude'],
  codex: ['Codex'],
  cursor: ['Cursor'],
};

const getDefaultInstallPath = () =>
  path.join(os.homedir(), '.skillpkg', 'skills');

let db = null;
let dbInitError = null;
let dbSaveQueue = Promise.resolve();

const getDatabasePath = () =>
  path.join(app.getPath('userData'), 'skillpkg.sqlite');
const initDatabase = async () => {
  try {
    const dbPath = getDatabasePath();
    const SQL = await initSqlJs();
    const existing = await fs.readFile(dbPath).catch(() => null);
    if (existing && existing.length) {
      db = new SQL.Database(new Uint8Array(existing));
    } else {
      db = new SQL.Database();
    }
    // 创建技能安装记录表，记录技能与 Agent 的关联信息。
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
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
};

/**
 * 检查路径是否存在。
 * @param targetPath - 需要检查的路径。
 */
const pathExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * 若路径存在则删除，失败则忽略。
 * @param targetPath - 需要删除的路径。
 */
const removeIfExists = async (targetPath) => {
  try {
    await fs.lstat(targetPath);
  } catch (error) {
    return;
  }
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch (error) {
    // ignore cleanup errors
  }
};

const extractSkillMarkdownMetadata = (content) => {
  if (!content) return null;
  const versionMatch = content.match(/^\s*version\s*:\s*(.+)$/im);
  const descriptionMatch = content.match(/^\s*description\s*:\s*(.+)$/im);
  const version = versionMatch ? versionMatch[1].trim() : null;
  const description = descriptionMatch ? descriptionMatch[1].trim() : null;
  if (!version && !description) return null;
  return { version, description };
};

const readSkillMarkdownMetadata = async (skillDir) => {
  try {
    const skillMdPath = path.join(skillDir, 'skill.md');
    const content = await fs.readFile(skillMdPath, 'utf-8');
    return extractSkillMarkdownMetadata(content);
  } catch (error) {
    return null;
  }
};

/**
 * 将路径模板解析为绝对路径。
 * @param template - 包含 ~ 或 %USERPROFILE% 的路径模板。
 */
const resolveTemplatePath = (template) => {
  if (!template || typeof template !== 'string') return null;
  let resolved = template;
  if (resolved === '~') {
    const homeDir = os.homedir();
    if (!homeDir) return null;
    resolved = homeDir;
  } else if (resolved.startsWith('~/')) {
    const homeDir = os.homedir();
    if (!homeDir) return null;
    resolved = path.join(homeDir, resolved.slice(2));
  }
  const userProfile = process.env.USERPROFILE || '';
  if (userProfile) {
    resolved = resolved.replace(/%USERPROFILE%/gi, userProfile);
  }
  const appData = process.env.APPDATA || '';
  if (appData) {
    resolved = resolved.replace(/%APPDATA%/gi, appData);
  }
  return path.normalize(resolved);
};

/**
 * 解析用于检测 Agent 安装位置的路径。
 * @param agentId - 需要检测的 Agent 标识。
 */
const resolveAgentPaths = (agentId) => {
  const platform = os.platform();
  if (platform === 'darwin') {
    const bundles = AGENT_APP_BUNDLES[agentId];
    if (!bundles?.length) return [];
    const homeDir = os.homedir();
    const userApplications = homeDir
      ? path.join(homeDir, 'Applications')
      : null;
    return bundles.flatMap((bundle) => {
      const paths = [path.join('/Applications', bundle)];
      if (userApplications) paths.push(path.join(userApplications, bundle));
      return paths;
    });
  }
  return [];
};

/**
 * 从 Agent 配置解析技能存放目录。
 * @param agent - 包含 OS 路径模板的 Agent 配置。
 */
const resolveAgentSkillPathFromAgent = (agent) => {
  if (!agent) return null;
  const platform = os.platform();
  const template = platform === 'win32' ? agent.pathWindows : agent.pathMac;
  return resolveTemplatePath(template);
};

const REGISTRY_UNINSTALL_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

/**
 * 对字符串进行正则转义。
 * @param value - 需要转义的原始字符串。
 */
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 查询 Windows 注册表卸载项中的 DisplayName。
 * @param key - 需要扫描的注册表根键。
 */
const queryRegistry = (key) =>
  new Promise((resolve) => {
    execFile(
      'reg',
      ['query', key, '/s', '/v', 'DisplayName'],
      { windowsHide: true },
      (error, stdout) => {
        if (error) return resolve('');
        resolve(stdout || '');
      },
    );
  });

/**
 * 在注册表卸载项中查找匹配的显示名称。
 * @param displayNames - 要匹配的应用显示名。
 */
const isInstalledViaRegistry = async (displayNames) => {
  if (!displayNames?.length) return false;
  const outputs = await Promise.all(
    REGISTRY_UNINSTALL_KEYS.map((key) => queryRegistry(key)),
  );
  const registryText = outputs.join('\n');
  return displayNames.some((name) => {
    const matcher = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    return matcher.test(registryText);
  });
};

/**
 * 判断 Agent 是否已安装（带缓存）
 * @param agentId - 需要检测的 Agent 标识。
 * @returns {Promise<boolean>}
 */
async function isAgentInstalled(agentId) {
  if (agentInstallStatus[agentId] !== undefined) {
    return agentInstallStatus[agentId];
  }
  const platform = getCurrentPlatform();
  let result = false;
  if (platform === 'darwin') {
    const candidates = resolveAgentPaths(agentId);
    for (const candidate of candidates) {
      if (await pathExists(candidate)) {
        result = true;
        break;
      }
    }
  } else if (platform === 'win32') {
    const displayNames = AGENT_WINDOWS_DISPLAY_NAMES[agentId] || [];
    result = await isInstalledViaRegistry(displayNames);
  }
  // 其他平台 result 保持 false
  agentInstallStatus[agentId] = result;
  return result;
}

/**
 * Agent 基类，实现技能链接逻辑。
 */
class BaseAgent {
  constructor({ id, name, pathMac, pathWindows }) {
    this.id = id;
    this.name = name;
    this.pathMac = pathMac;
    this.pathWindows = pathWindows;
  }

  /**
   * 解析当前系统下的 Agent 技能存放路径。
   */
  resolveSkillPath() {
    const template =
      os.platform() === 'win32' ? this.pathWindows : this.pathMac;
    return resolveTemplatePath(template);
  }

  /**
   * 创建技能软链接/目录链接到统一路径。
   * @param skillId - 需要链接的技能标识。
   * @param targetDir - 统一技能目录路径。
   */
  async ensureSkillLink(skillId, targetDir) {
    const skillRoot = this.resolveSkillPath();
    if (!skillRoot) return false;
    await ensureDir(skillRoot);
    const linkPath = path.join(skillRoot, skillId);
    await removeIfExists(linkPath);
    const linkType = os.platform() === 'win32' ? 'junction' : 'dir';
    await fs.symlink(targetDir, linkPath, linkType);
    return true;
  }

  /**
   * 从 Agent 目录移除技能链接。
   * @param skillId - 需要移除的技能标识。
   */
  async removeSkillLink(skillId) {
    const skillRoot = this.resolveSkillPath();
    if (!skillRoot) return false;
    const linkPath = path.join(skillRoot, skillId);
    await removeIfExists(linkPath);
    return true;
  }

  /**
   * 安装技能（在 Agent 目录下建立链接）。
   * @param skillId - 需要安装的技能标识。
   * @param targetDir - 统一技能目录路径。
   */
  async install(skillId, targetDir) {
    return this.ensureSkillLink(skillId, targetDir);
  }

  /**
   * 卸载技能（移除链接）。
   * @param skillId - 需要卸载的技能标识。
   */
  async uninstall(skillId) {
    return this.removeSkillLink(skillId);
  }
}

class ClaudeAgent extends BaseAgent {}
class CodexAgent extends BaseAgent {}
class CursorAgent extends BaseAgent {}

/**
 * 根据 Agent 配置创建对应的处理实例。
 * @param agent - 包含 id 与路径配置的 Agent。
 */
const createAgentInstance = (agent) => {
  if (!agent?.id) return null;
  if (agent.id === 'claude') return new ClaudeAgent(agent);
  if (agent.id === 'codex') return new CodexAgent(agent);
  if (agent.id === 'cursor') return new CursorAgent(agent);
  return new BaseAgent(agent);
};

/**
 * 从指定路径加载技能列表。
 * @param installPath - 包含各技能子目录的根路径。
 */
const loadSkillsFromPath = async (installPath) => {
  if (!installPath) return [];
  try {
    const entries = await fs.readdir(installPath, { withFileTypes: true });
    const skills = [];
    for (const entry of entries) {
      const fullPath = path.join(installPath, entry.name);
      const isDirectory = entry.isDirectory();
      const isLinkedDirectory =
        entry.isSymbolicLink() &&
        (await fs
          .stat(fullPath)
          .then((stats) => stats.isDirectory())
          .catch(() => false));
      // 既接受真实目录，也接受指向目录的软连接/链接目录。
      if (isDirectory || isLinkedDirectory) {
        const source = isLinkedDirectory ? 'linked' : 'local';
        skills.push(await readSkillFromDir(fullPath, entry.name, source));
      }
    }
    return skills;
  } catch (error) {
    return [];
  }
};

/**
 * 递归收集技能目录下的文件。
 * @param baseDir - 用于计算相对路径的根目录。
 * @param currentDir - 当前遍历的目录。
 */
const collectFiles = async (baseDir, currentDir = baseDir) => {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(baseDir, fullPath)));
    } else if (entry.isFile()) {
      const relativePath = path
        .relative(baseDir, fullPath)
        .split(path.sep)
        .join('/');
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

/**
 * 从磁盘目录构建技能对象。
 * @param skillDir - 包含 skill.json 与文件的目录。
 * @param skillId - 目录名派生的技能标识。
 */
const readSkillFromDir = async (skillDir, skillId, source) => {
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
    source,
  };
};

app.on('ready', async () => {
  await initDatabase();
  createWindow();

  ipcMain.handle('get-default-install-path', async () => {
    return getDefaultInstallPath();
  });

  ipcMain.handle('select-install-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths?.[0] || null;
  });

  ipcMain.handle('load-skills', async (_event, installPath) => {
    return loadSkillsFromPath(installPath);
  });

  ipcMain.handle('install-skill', async (_event, payload) => {
    const { installPath, skill, agents, overwrite } = payload || {};
    if (!installPath || !skill?.id) return { ok: false, reason: 'invalid' };
    const agentList = Array.isArray(agents) ? agents : [];
    if (!agentList.length) return { ok: false, reason: 'no-agents' };
    const skillDir = path.join(installPath, skill.id);
    if ((await pathExists(skillDir)) && !overwrite) {
      return { ok: false, reason: 'exists' };
    }
    if (overwrite) {
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
    const agentsToInstall = agentList
      .map((agent) => createAgentInstance(agent))
      .filter(Boolean);
    const installResults = await Promise.all(
      agentsToInstall.map(async (agent) => {
        try {
          await agent.install(skill.id, skillDir);
          return { agentId: agent.id, ok: true };
        } catch (error) {
          return { agentId: agent.id, ok: false };
        }
      }),
    );
    const markdownMetadata = await readSkillMarkdownMetadata(skillDir);
    for (const result of installResults) {
      if (!result.ok) continue;
      await upsertSkillInstallRecord({
        skillId: skill.id,
        agentId: result.agentId,
        version: markdownMetadata?.version || null,
        description: markdownMetadata?.description || null,
      });
    }
    return { ok: true };
  });

  ipcMain.handle('load-skill-install-records', async (_event, filters) => {
    return listSkillInstallRecords(filters);
  });

  ipcMain.handle('get-db-info', async () => {
    return getDatabaseInfo();
  });

  ipcMain.handle('save-skill-file', async (_event, payload) => {
    const { installPath, skillId, filePath, content } = payload || {};
    if (!installPath || !skillId || !filePath) return false;
    const targetPath = path.join(installPath, skillId, ...filePath.split('/'));
    await ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, content || '');
    return true;
  });

  ipcMain.handle('load-agent-skills', async (_event, agents) => {
    const list = Array.isArray(agents) ? agents : [];
    const results = await Promise.all(
      list.map(async (agent) => {
        const resolvedPath = resolveAgentSkillPathFromAgent(agent);
        if (!resolvedPath || !(await pathExists(resolvedPath))) {
          return { agentId: agent.id, agentName: agent.name, skills: [] };
        }
        const skills = await loadSkillsFromPath(resolvedPath);
        return { agentId: agent.id, agentName: agent.name, skills };
      }),
    );
    return results;
  });

  ipcMain.handle('migrate-skills', async (_event, payload) => {
    const { installPath, items } = payload || {};
    if (!installPath || !Array.isArray(items) || !items.length) return [];
    await ensureDir(installPath);
    const results = await Promise.all(
      items.map(async (item) => {
        const sourcePath = resolveAgentSkillPathFromAgent(item);
        if (!sourcePath) {
          return {
            agentId: item.agentId,
            skillId: item.skillId,
            ok: false,
            reason: 'source-missing',
          };
        }
        const sourceDir = path.join(sourcePath, item.skillId);
        if (!(await pathExists(sourceDir))) {
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
    const { installPath, skillId } = payload || {};
    if (!installPath || !skillId) return false;
    const targetDir = path.join(installPath, skillId);
    if (!(await pathExists(targetDir))) return false;
    shell.showItemInFolder(targetDir);
    return true;
  });
  // 检查指定的 Agent 是否安装
  ipcMain.handle('detect-agents', async (_event, names) => {
    const list = Array.isArray(names) ? names : names ? [names] : [];
    const results = await Promise.all(
      list.map(async (name) => ({
        name,
        installed: await isAgentInstalled(name),
      })),
    );
    return results;
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
