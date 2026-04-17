const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skillpkg', {
  selectInstallPath: () => ipcRenderer.invoke('select-install-path'),
  loadSkills: (installPath) => ipcRenderer.invoke('load-skills', installPath),
  installSkill: (payload) => ipcRenderer.invoke('install-skill', payload),
  saveSkillFile: (payload) => ipcRenderer.invoke('save-skill-file', payload),
});
