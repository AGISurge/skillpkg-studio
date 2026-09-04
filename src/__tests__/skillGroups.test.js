/** @jest-environment node */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const initSqlJs = require('sql.js/dist/sql-asm.js');
const { createSkillGroupStore, ensureSkillGroupSchema } = require('../../electron/skillGroupStore');
const { createGroupLibraryGuard, inspectSkill, reconcileSkillGroups, validateGroupSkills, replaceAgentSkillGroup } = require('../../electron/skillGroupService');
const { createMutationCoordinator } = require('../../electron/mutationCoordinator');
const { loadSkillsFromPath } = require('../../electron/skillScanner');

let SQL;
let db;
let store;
let persist;
let tmp;
let library;
let agent;
const writeSkill = async (root, id, metadata) => {
  const directory = path.join(root, id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${id}\ndescription: Test ${id}\n---\n# ${id}`);
  if (metadata) await fs.writeFile(path.join(directory, 'skill.json'), JSON.stringify(metadata));
  return directory;
};
beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'skill-groups-')));
  library = path.join(tmp, 'library'); agent = path.join(tmp, 'agent', 'skills');
  await fs.mkdir(library); await fs.mkdir(agent, { recursive: true });
  db = new SQL.Database();
  db.run('CREATE TABLE skill_agent_link (skillId TEXT, agentId TEXT, version TEXT, description TEXT, UNIQUE(skillId, agentId))');
  ensureSkillGroupSchema(db);
  persist = jest.fn(async () => {});
  store = createSkillGroupStore({ getDatabase: () => db, persist, restoreDatabase: (bytes) => { db.close(); db = new SQL.Database(bytes); } });
});
afterEach(async () => { db.close(); await fs.rm(tmp, { recursive: true, force: true }); });

test('persists group members across schema upgrades, restart and backup restoration', async () => {
  const group = await store.save({ name: '  Product  ', skillIds: ['a', 'b', 'a'] });
  expect(group.name).toBe('Product'); expect(group.skillIds).toEqual(['a', 'b']);
  const backup = db.export();
  await store.remove(group.id); expect(store.list()).toEqual([]);
  db.close(); db = new SQL.Database(backup); ensureSkillGroupSchema(db);
  expect(store.list()).toEqual([group]);
  await store.save({ id: group.id, name: 'PRODUCT', skillIds: ['b'] });
  expect(store.list()[0].skillIds).toEqual(['b']);
});
test('rejects blank, duplicate and empty groups without changing existing data', async () => {
  const original = await store.save({ name: 'Design', skillIds: ['a'] });
  await expect(store.save({ name: ' design ', skillIds: ['b'] })).rejects.toThrow('已存在');
  await expect(store.save({ name: ' \t ', skillIds: ['b'] })).rejects.toThrow('不能为空');
  await expect(store.save({ name: 'Empty', skillIds: [] })).rejects.toThrow('至少');
  expect(store.list()).toEqual([original]);
});
test('failed disk writes restore both group data and installation records', async () => {
  const original = await store.save({ name: 'Original', skillIds: ['a'] });
  persist.mockRejectedValueOnce(new Error('disk failure'));
  await expect(store.save({ id: original.id, name: 'Changed', skillIds: ['b'] })).rejects.toThrow('disk failure');
  expect(store.list()).toEqual([original]);
  db.run("INSERT INTO skill_agent_link VALUES ('old', 'agent', '1', 'old')");
  persist.mockRejectedValueOnce(new Error('disk failure'));
  await expect(store.replaceAgentSkills('agent', [{ id: 'new' }])).rejects.toThrow();
  expect(db.exec('SELECT skillId FROM skill_agent_link')[0].values).toEqual([['old']]);
});
test('recognizes explicit solution types while preserving legacy skills', async () => {
  await writeSkill(library, 'legacy'); await writeSkill(library, 'solution', { type: 'solution' });
  expect((await loadSkillsFromPath(library)).map((skill) => skill.type)).toEqual(['skill', 'solution']);
  await expect(validateGroupSkills(library, ['solution'])).rejects.toThrow('失效');
  await expect(validateGroupSkills(library, ['../outside'])).rejects.toThrow('无效');
  await expect(validateGroupSkills(library, ['legacy'])).resolves.toHaveLength(1);
});
test('cleans missing and non-skill references while retaining empty groups', async () => {
  await writeSkill(library, 'solution', { type: 'solution' });
  const group = await store.save({ name: 'Group', skillIds: ['missing', 'solution'] });
  const result = await reconcileSkillGroups(store, library);
  expect(result[0].id).toBe(group.id); expect(result[0].skillIds).toEqual([]);
});
test('unavailable library and permission errors never erase references', async () => {
  await writeSkill(library, 'keep'); await store.save({ name: 'Group', skillIds: ['keep'] });
  await reconcileSkillGroups(store, path.join(tmp, 'unmounted'));
  expect(store.list()[0].skillIds).toEqual(['keep']);
  const io = { ...fs, readFile: async () => { const error = new Error('denied'); error.code = 'EACCES'; throw error; } };
  await reconcileSkillGroups(store, library, io);
  expect(store.list()[0].skillIds).toEqual(['keep']);
});

test('stale refreshes after library migration cannot prune group members', async () => {
  const guard = createGroupLibraryGuard();
  expect(guard.accepts(library)).toBe(true);
  const newLibrary = path.join(tmp, 'new-library');
  await writeSkill(newLibrary, 'keep');
  await store.save({ name: 'Group', skillIds: ['keep'] });
  guard.migrated(newLibrary);
  if (guard.accepts(library)) await reconcileSkillGroups(store, library);
  expect(store.list()[0].skillIds).toEqual(['keep']);
  expect(guard.accepts(newLibrary)).toBe(true);
  guard.migrated(library);
  expect(guard.accepts(library)).toBe(true);
});

const setupSwitch = async () => {
  const old = await writeSkill(library, 'old');
  await fs.symlink(old, path.join(agent, 'old'), 'dir');
  await writeSkill(agent, 'unmanaged');
  await fs.writeFile(path.join(agent, 'unmanaged', 'notes.txt'), 'precious data');
  await fs.mkdir(path.join(agent, '.system')); await fs.writeFile(path.join(agent, '.system', 'config'), 'system');
  await fs.writeFile(path.join(agent, 'config.json'), '{}');
  await writeSkill(library, 'target');
  return { skillRoot: agent, installPath: library, skills: [await inspectSkill(library, 'target')], commit: jest.fn(async () => {}) };
};
test('hosts unmanaged directories before switching and preserves library, external links and unrelated files', async () => {
  const options = await setupSwitch();
  const external = await writeSkill(tmp, 'external');
  await fs.symlink(external, path.join(agent, 'external'), 'dir');
  const io = { ...fs, symlink: jest.fn(fs.symlink), unlink: jest.fn(fs.unlink) };
  const result = await replaceAgentSkillGroup({ ...options, io });
  expect(result.ok).toBe(true); expect(options.commit).toHaveBeenCalledTimes(1);
  expect(result.hostedSkillIds.sort()).toEqual(['external', 'unmanaged']);
  expect(await fs.readdir(agent)).toEqual(['.system', 'config.json', 'target']);
  expect(await fs.readFile(path.join(library, 'unmanaged', 'notes.txt'), 'utf8')).toBe('precious data');
  expect(await fs.readFile(path.join(external, 'SKILL.md'), 'utf8')).toContain('external');
  expect(await fs.realpath(path.join(agent, 'target'))).toBe(path.join(library, 'target'));
  const hostCall = io.symlink.mock.calls.findIndex((call) => call[1] === path.join(agent, 'unmanaged'));
  const unlinkCall = io.unlink.mock.calls.findIndex((call) => call[0] === path.join(agent, 'unmanaged'));
  expect(hostCall).toBeGreaterThanOrEqual(0);
  expect(io.symlink.mock.invocationCallOrder[hostCall]).toBeLessThan(io.unlink.mock.invocationCallOrder[unlinkCall]);
  expect(await fs.readFile(path.join(library, 'old', 'SKILL.md'), 'utf8')).toContain('old');
});
test('same-name hosting conflict stops before any Agent entry is modified', async () => {
  const options = await setupSwitch();
  await writeSkill(library, 'unmanaged');
  const result = await replaceAgentSkillGroup(options);
  expect(result.ok).toBe(false); expect(result.error).toContain('同名');
  expect(await fs.readdir(agent)).toContain('unmanaged'); expect(options.commit).not.toHaveBeenCalled();
  expect((await fs.lstat(path.join(agent, 'unmanaged'))).isDirectory()).toBe(true);
});
test('managed links through library aliases are unlinked without copying or touching their targets', async () => {
  const options = await setupSwitch();
  const external = await writeSkill(tmp, 'linked-source');
  await fs.symlink(external, path.join(library, 'alias'), 'dir');
  await fs.symlink(path.join(library, 'alias'), path.join(agent, 'alias'), 'dir');
  const result = await replaceAgentSkillGroup(options);
  expect(result.ok).toBe(true);
  expect(result.hostedSkillIds).not.toContain('alias');
  expect(await fs.readFile(path.join(library, 'alias', 'SKILL.md'), 'utf8')).toContain('linked-source');
});
test('failed hosting copy leaves Agent originals untouched', async () => {
  const options = await setupSwitch();
  const result = await replaceAgentSkillGroup({ ...options, io: { ...fs, cp: async () => { throw new Error('copy denied'); } } });
  expect(result.ok).toBe(false); expect(result.error).toBe('copy denied');
  expect(await fs.readFile(path.join(agent, 'unmanaged', 'notes.txt'), 'utf8')).toBe('precious data');
  expect(await fs.readdir(library)).not.toContain('unmanaged');
});
test('database failure rolls back target links and restores original directories', async () => {
  const options = await setupSwitch();
  const result = await replaceAgentSkillGroup({ ...options, commit: async () => { throw new Error('database failed'); } });
  expect(result.ok).toBe(false); expect(result.recoveryPath).toBeUndefined();
  expect(await fs.readdir(agent)).toEqual(['.system', 'config.json', 'old', 'unmanaged']);
  expect(await fs.realpath(path.join(agent, 'old'))).toBe(path.join(library, 'old'));
  expect(await fs.readFile(path.join(agent, 'unmanaged', 'notes.txt'), 'utf8')).toBe('precious data');
  expect(await fs.readFile(path.join(library, 'unmanaged', 'notes.txt'), 'utf8')).toBe('precious data');
});
test('failed target installation restores already moved originals', async () => {
  const options = await setupSwitch();
  const result = await replaceAgentSkillGroup({ ...options, io: { ...fs, rename: async (from, to) => {
    if (from.includes(`${path.sep}prepared${path.sep}`)) throw new Error('rename failed');
    return fs.rename(from, to);
  } } });
  expect(result.ok).toBe(false); expect(result.recoveryPath).toBeUndefined();
  expect(await fs.readFile(path.join(agent, 'unmanaged', 'notes.txt'), 'utf8')).toBe('precious data');
});

test('a target removed during hosting aborts without removing Agent skills', async () => {
  const options = await setupSwitch();
  const result = await replaceAgentSkillGroup({ ...options, io: { ...fs, cp: async (...args) => {
    await fs.cp(...args);
    await fs.rm(path.join(library, 'target'), { recursive: true, force: true });
  } } });
  expect(result.ok).toBe(false);
  expect(options.commit).not.toHaveBeenCalled();
  expect(await fs.readFile(path.join(agent, 'unmanaged', 'notes.txt'), 'utf8')).toBe('precious data');
});
test('incomplete rollback retains a recovery location with originals', async () => {
  const options = await setupSwitch();
  const result = await replaceAgentSkillGroup({ ...options, commit: async () => { throw new Error('commit failed'); }, io: { ...fs, rename: async (from, to) => {
    if (from.includes(`${path.sep}original${path.sep}`)) throw new Error('restore denied');
    return fs.rename(from, to);
  } } });
  expect(result.ok).toBe(false); expect(result.recoveryPath).toBeTruthy();
  expect(await fs.readFile(path.join(result.recoveryPath, 'original', 'unmanaged', 'notes.txt'), 'utf8')).toBe('precious data');
});
test('blocks overlapping writes and duplicate switches while allowing queued reads', async () => {
  const coordinate = createMutationCoordinator();
  let release;
  const switching = coordinate(() => new Promise((resolve) => { release = resolve; }), { switchSkills: true });
  await Promise.resolve();
  await expect(coordinate(async () => {})).rejects.toThrow('正在切换');
  await expect(coordinate(async () => {}, { switchSkills: true })).rejects.toThrow('正在切换');
  const read = jest.fn(); const queued = coordinate(read, { read: true });
  expect(read).not.toHaveBeenCalled(); release(); await switching; await queued;
  expect(read).toHaveBeenCalledTimes(1);
  await expect(coordinate(async () => 'done')).resolves.toBe('done');
});
