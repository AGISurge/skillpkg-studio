const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skillpkg', {
  getDefaultInstallPath: () => ipcRenderer.invoke('get-default-install-path'),
  selectInstallPath: () => ipcRenderer.invoke('select-install-path'),
  loadSkills: (installPath) => ipcRenderer.invoke('load-skills', installPath),
  installSkill: (payload) => ipcRenderer.invoke('install-skill', payload),
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
  getDbInfo: () => ipcRenderer.invoke('get-db-info'),
  getAgentSkillCounts: (payload) =>
    ipcRenderer.invoke('get-agent-skill-counts', payload),
});
