const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skillpkg', {
  getDefaultInstallPath: () => ipcRenderer.invoke('get-default-install-path'),
  selectInstallPath: () => ipcRenderer.invoke('select-install-path'),
  selectImportZip: () => ipcRenderer.invoke('select-import-zip'),
  importSkillSource: (payload) => ipcRenderer.invoke('import-skill-source', payload),
  scanImportCandidates: (payload) =>
    ipcRenderer.invoke('scan-import-candidates', payload),
  listSkillpkgCategories: (payload) =>
    ipcRenderer.invoke('list-skillpkg-categories', payload),
  listSkillpkgSkills: (payload) =>
    ipcRenderer.invoke('list-skillpkg-skills', payload),
  getSkillpkgSkillDetail: (payload) =>
    ipcRenderer.invoke('get-skillpkg-skill-detail', payload),
  downloadSkillpkgSkill: (payload) =>
    ipcRenderer.invoke('download-skillpkg-skill', payload),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  loadSkills: (installPath) => ipcRenderer.invoke('load-skills', installPath),
  installSkill: (payload) => ipcRenderer.invoke('install-skill', payload),
  installLibrarySkills: (payload) =>
    ipcRenderer.invoke('install-library-skills', payload),
  // 检查指定的 Agent 是否安装
  detectAgents: (names) => ipcRenderer.invoke('detect-agents', names),
  loadAgentSkills: (payload) => ipcRenderer.invoke('load-agent-skills', payload),
  uninstallAgentSkill: (payload) =>
    ipcRenderer.invoke('uninstall-agent-skill', payload),
  unhostAgentSkill: (payload) => ipcRenderer.invoke('unhost-agent-skill', payload),
  migrateSkills: (payload) => ipcRenderer.invoke('migrate-skills', payload),
  openSkillPath: (payload) => ipcRenderer.invoke('open-skill-path', payload),
  saveSkillFile: (payload) => ipcRenderer.invoke('save-skill-file', payload),
  loadSkillFile: (payload) => ipcRenderer.invoke('load-skill-file', payload),
  loadSkillInstallRecords: (filters) =>
    ipcRenderer.invoke('load-skill-install-records', filters),
  loadFavoriteSkillIds: () => ipcRenderer.invoke('load-favorite-skill-ids'),
  replaceFavoriteSkillIds: (skillIds) =>
    ipcRenderer.invoke('replace-favorite-skill-ids', skillIds),
  getDbInfo: () => ipcRenderer.invoke('get-db-info'),
  getAgentSkillCounts: (payload) =>
    ipcRenderer.invoke('get-agent-skill-counts', payload),
});
