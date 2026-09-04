const { randomUUID } = require('crypto');

const ensureSkillGroupSchema = (db) => db.run(`
  CREATE TABLE IF NOT EXISTS skill_group (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, nameKey TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS skill_group_member (
    groupId TEXT NOT NULL, skillId TEXT NOT NULL, position INTEGER NOT NULL,
    PRIMARY KEY (groupId, skillId)
  );
`);

const rows = (db, sql, values = []) => {
  const statement = db.prepare(sql);
  try {
    statement.bind(values);
    const result = [];
    while (statement.step()) result.push(statement.getAsObject());
    return result;
  } finally {
    statement.free();
  }
};

// All callers run under the main-process mutation coordinator. A failed atomic
// disk write restores the in-memory database too, including installation records.
const createSkillGroupStore = ({ getDatabase, persist, restoreDatabase }) => {
  const database = () => {
    const db = getDatabase();
    if (!db) throw new Error('数据库不可用，请检查数据库设置。');
    return db;
  };
  const mutate = async (write) => {
    const db = database();
    const snapshot = db.export();
    try {
      db.run('BEGIN TRANSACTION');
      const result = write(db);
      db.run('COMMIT');
      await persist();
      return result;
    } catch (error) {
      restoreDatabase(snapshot);
      try {
        await persist();
      } catch (restoreError) {
        error.recoveryRequired = true;
      }
      throw error;
    }
  };
  const list = () => {
    const db = database();
    const members = rows(db, 'SELECT groupId, skillId FROM skill_group_member ORDER BY position');
    return rows(db, 'SELECT id, name, createdAt, updatedAt FROM skill_group ORDER BY updatedAt DESC, id').map((group) => ({
      ...group,
      skillIds: members.filter((member) => member.groupId === group.id).map((member) => member.skillId),
    }));
  };
  const save = async ({ id, name, skillIds }) => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) throw new Error('技能组名称不能为空或全为空格。');
    if (!Array.isArray(skillIds) || !skillIds.length) throw new Error('请至少选择一个有效技能。');
    const nameKey = trimmed.toLowerCase();
    const existing = list();
    if (id && !existing.some((group) => group.id === id)) throw new Error('技能组已被删除，请刷新列表。');
    if (existing.some((group) => group.id !== id && group.name.toLowerCase() === nameKey)) {
      throw new Error('技能组名称已存在。');
    }
    const groupId = id || randomUUID();
    const now = new Date().toISOString();
    await mutate((db) => {
      if (id) db.run('UPDATE skill_group SET name = ?, nameKey = ?, updatedAt = ? WHERE id = ?', [trimmed, nameKey, now, id]);
      else db.run('INSERT INTO skill_group VALUES (?, ?, ?, ?, ?)', [groupId, trimmed, nameKey, now, now]);
      db.run('DELETE FROM skill_group_member WHERE groupId = ?', [groupId]);
      [...new Set(skillIds)].forEach((skillId, position) => db.run(
        'INSERT INTO skill_group_member VALUES (?, ?, ?)', [groupId, skillId, position],
      ));
    });
    return list().find((group) => group.id === groupId);
  };
  const remove = (id) => mutate((db) => {
    db.run('DELETE FROM skill_group_member WHERE groupId = ?', [id]);
    db.run('DELETE FROM skill_group WHERE id = ?', [id]);
  });
  const removeMembers = async (ids) => {
    const affected = list().filter((group) => group.skillIds.some((id) => ids.includes(id)));
    if (!affected.length) return;
    await mutate((db) => {
      ids.forEach((id) => db.run('DELETE FROM skill_group_member WHERE skillId = ?', [id]));
      affected.forEach((group) => db.run('UPDATE skill_group SET updatedAt = ? WHERE id = ?', [new Date().toISOString(), group.id]));
    });
  };
  const replaceAgentSkills = (agentId, skills) => mutate((db) => {
    db.run('DELETE FROM skill_agent_link WHERE agentId = ?', [agentId]);
    skills.forEach((skill) => db.run(
      'INSERT INTO skill_agent_link (skillId, agentId, version, description) VALUES (?, ?, ?, ?)',
      [skill.id, agentId, skill.version || null, skill.description || null],
    ));
  });
  return { list, save, remove, removeMembers, replaceAgentSkills };
};

module.exports = { ensureSkillGroupSchema, createSkillGroupStore };
