const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skillpkg', {
  getDefaultInstallPath: () => ipcRenderer.invoke('get-default-install-path'),
  selectInstallPath: () => ipcRenderer.invoke('select-install-path'),
  loadSkills: (installPath) => ipcRenderer.invoke('load-skills', installPath),
  installSkill: (payload) => ipcRenderer.invoke('install-skill', payload),
  detectAgents: (names) => ipcRenderer.invoke('detect-agents', names),
  loadAgentSkills: (agents) => ipcRenderer.invoke('load-agent-skills', agents),
  migrateSkills: (payload) => ipcRenderer.invoke('migrate-skills', payload),
  openSkillPath: (payload) => ipcRenderer.invoke('open-skill-path', payload),
  saveSkillFile: (payload) => ipcRenderer.invoke('save-skill-file', payload),
  loadSkillInstallRecords: (filters) => ipcRenderer.invoke('load-skill-install-records', filters),
  getDbInfo: () => ipcRenderer.invoke('get-db-info'),
});
