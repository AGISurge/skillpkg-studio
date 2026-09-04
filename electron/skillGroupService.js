const path = require('path');
const fs = require('fs/promises');
const { getManagedRootPaths, parseSkillMarkdownMetadata, resolveSkillType } = require('./skillScanner');
const { isPathInside } = require('./pathUtils');

const safeSkillId = (id) => typeof id === 'string' && id.length > 0 &&
  id !== '.' && id !== '..' && !/[\\/\0]/.test(id);

// A queued refresh can still carry the old path after a successful migration.
// Only the active library may be used as evidence for removing group members.
const createGroupLibraryGuard = () => {
  let activePath = null;
  return {
    accepts(root) {
      if (typeof root !== 'string' || !root) return false;
      const normalized = path.resolve(root);
      if (!activePath) activePath = normalized;
      return activePath === normalized;
    },
    migrated(root) { activePath = path.resolve(root); },
  };
};

// Deliberately use strict reads here. The ordinary UI scanner tolerates I/O
// failures; that behavior must never be used as evidence for deleting references.
const inspectSkill = async (root, id, io = fs) => {
  if (!safeSkillId(id)) throw new Error('技能标识无效。');
  const skillPath = path.join(root, id);
  let markdown;
  try {
    const entries = await io.readdir(skillPath, { withFileTypes: true });
    if (!entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) return null;
    markdown = await io.readFile(path.join(skillPath, 'SKILL.md'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
  let metadata = {};
  try {
    metadata = JSON.parse(await io.readFile(path.join(skillPath, 'skill.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const parsed = parseSkillMarkdownMetadata(markdown);
  return {
    id, name: parsed.name || metadata?.name || id,
    type: resolveSkillType(parsed, metadata),
    version: parsed.version || metadata?.version,
    description: parsed.description || metadata?.description,
    rootPath: skillPath,
  };
};

const reconcileSkillGroups = async (store, installPath, io = fs) => {
  const groups = store.list();
  if (!installPath) return groups;
  // A missing or unreadable library is not an empty library.
  try { await io.readdir(installPath); } catch (_error) { return groups; }
  const invalid = [];
  for (const id of new Set(groups.flatMap((group) => group.skillIds))) {
    try {
      const skill = await inspectSkill(installPath, id, io);
      if (!skill || skill.type !== 'skill') invalid.push(id);
    } catch (_error) { /* Unknown state: retain the reference. */ }
  }
  // Recheck availability before committing any cleanup.
  try { await io.readdir(installPath); } catch (_error) { return groups; }
  await store.removeMembers(invalid);
  return store.list();
};

const validateGroupSkills = async (installPath, skillIds, io = fs) => {
  if (!installPath || !Array.isArray(skillIds) || !skillIds.length) throw new Error('请至少选择一个有效的本地技能。');
  await io.readdir(installPath);
  const skills = [];
  for (const id of new Set(skillIds)) {
    const skill = await inspectSkill(installPath, id, io);
    if (!skill || skill.type !== 'skill') throw new Error(`技能 ${id} 已失效，请刷新后重新选择。`);
    skills.push(skill);
  }
  return skills;
};

// Stage links first, then move original entries (never their symlink targets).
// Keep the backup outside the scanned skill root and on the same filesystem.
const replaceAgentSkillGroup = async ({ skillRoot, installPath, skills, commit, io = fs }) => {
  let staging;
  let committed = false;
  const moved = [];
  const installed = [];
  const hostedLinks = [];
  const hostedSkillIds = [];
  try {
    await io.mkdir(skillRoot, { recursive: true });
    const realRoot = await io.realpath(skillRoot);
    const realLibrary = await io.realpath(installPath);
    if (realRoot === realLibrary || isPathInside(realRoot, realLibrary) || isPathInside(realLibrary, realRoot)) {
      throw new Error('Agent 技能目录与本地库不能相同或互相包含。');
    }
    const entries = await io.readdir(skillRoot);
    const managedRoots = await getManagedRootPaths(installPath);
    const original = [];
    const unmanaged = [];
    for (const id of entries) {
      if (id === '.system') continue;
      // Match the scanner: only direct entries containing SKILL.md are skills.
      const skill = await inspectSkill(skillRoot, id, io);
      if (skill) {
        original.push(id);
        const entryPath = path.join(skillRoot, id);
        const stat = await io.lstat(entryPath);
        const target = await io.realpath(entryPath);
        const directTarget = stat.isSymbolicLink()
          ? path.resolve(path.dirname(entryPath), await io.readlink(entryPath))
          : null;
        const managed = stat.isSymbolicLink() && managedRoots.some((root) =>
          isPathInside(target, root) || (directTarget && isPathInside(directTarget, root)));
        if (!managed) {
          // Never overwrite an existing library entry while protecting a skill.
          try {
            await io.lstat(path.join(installPath, id));
            throw new Error(`非托管技能 ${id} 与本地库同名，请先在“本机 → 整理”中处理冲突，再切换技能组。`);
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
          unmanaged.push(id);
        }
      }
    }
    for (const skill of skills) {
      if (!safeSkillId(skill.id)) throw new Error('技能标识无效。');
      if (entries.includes(skill.id) && !original.includes(skill.id)) {
        throw new Error(`目标目录中存在非技能条目 ${skill.id}，无法覆盖。`);
      }
      const realTarget = await io.realpath(skill.rootPath);
      if (realTarget === realRoot || isPathInside(realTarget, realRoot)) {
        throw new Error(`技能 ${skill.id} 的来源位于将被替换的 Agent 目录中，请先整理到本地库。`);
      }
    }
    staging = await io.mkdtemp(path.join(path.dirname(realRoot), '.skillpkg-switch-'));
    const backup = path.join(staging, 'original');
    const prepared = path.join(staging, 'prepared');
    await io.mkdir(backup);
    await io.mkdir(prepared);
    await io.writeFile(path.join(staging, 'recovery.json'), JSON.stringify({ skillRoot: realRoot, original, target: skills.map((skill) => skill.id) }, null, 2));
    for (const skill of skills) {
      await io.symlink(path.resolve(skill.rootPath), path.join(prepared, skill.id), process.platform === 'win32' ? 'junction' : 'dir');
    }
    // Fully copy every unmanaged skill before touching any Agent entry. Keep
    // these protected library copies even if the subsequent switch rolls back.
    for (const id of unmanaged) {
      const target = path.join(installPath, id);
      const source = await io.realpath(path.join(skillRoot, id));
      await io.mkdir(target); // Exclusive reservation: an external collision fails.
      try {
        await io.cp(source, target, { recursive: true, dereference: true, force: false, errorOnExist: true });
        hostedSkillIds.push(id);
      } catch (error) {
        await io.rm(target, { recursive: true, force: true });
        throw error;
      }
    }
    await validateGroupSkills(installPath, skills.map((skill) => skill.id), io);
    for (const id of original) {
      await io.rename(path.join(skillRoot, id), path.join(backup, id));
      moved.push(id);
      if (unmanaged.includes(id)) {
        await io.symlink(path.resolve(installPath, id), path.join(skillRoot, id), process.platform === 'win32' ? 'junction' : 'dir');
        hostedLinks.push(id);
      }
    }
    for (const id of [...hostedLinks]) {
      await io.unlink(path.join(skillRoot, id));
      hostedLinks.splice(hostedLinks.indexOf(id), 1);
    }
    for (const skill of skills) {
      // Catch changes by external processes after preflight without overwriting.
      try {
        await io.lstat(path.join(skillRoot, skill.id));
        throw new Error(`目标 ${skill.id} 在切换期间发生变化。`);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await io.rename(path.join(prepared, skill.id), path.join(skillRoot, skill.id));
      installed.push(skill.id);
    }
    await validateGroupSkills(installPath, skills.map((skill) => skill.id), io);
    await commit();
    committed = true;
  } catch (error) {
    let recoveryRequired = Boolean(error.recoveryRequired);
    for (const id of [...installed, ...hostedLinks].reverse()) {
      try { await io.unlink(path.join(skillRoot, id)); } catch (_error) { recoveryRequired = true; }
    }
    for (const id of moved.reverse()) {
      try {
        // Never overwrite something created externally during the operation.
        try { await io.lstat(path.join(skillRoot, id)); throw new Error('conflict'); }
        catch (checkError) { if (checkError.code !== 'ENOENT') throw checkError; }
        await io.rename(path.join(staging, 'original', id), path.join(skillRoot, id));
      } catch (_error) { recoveryRequired = true; }
    }
    if (staging && !recoveryRequired) {
      try { await io.rm(staging, { recursive: true, force: true }); } catch (_error) { recoveryRequired = true; }
    }
    return { ok: false, error: error.message, recoveryPath: recoveryRequired ? staging : undefined, hostedSkillIds };
  }
  if (committed && staging) {
    try { await io.rm(staging, { recursive: true, force: true }); }
    catch (_error) { return { ok: true, recoveryPath: staging, warning: '切换成功，旧技能暂存目录未能清理。', hostedSkillIds }; }
  }
  return { ok: true, hostedSkillIds };
};

module.exports = { createGroupLibraryGuard, inspectSkill, reconcileSkillGroups, validateGroupSkills, replaceAgentSkillGroup };
