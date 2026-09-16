const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('setup', {
  state: () => ipcRenderer.invoke('setup:state'),
  install: mode => ipcRenderer.invoke('setup:install', mode),
  launch: mode => ipcRenderer.invoke('setup:launch', mode),
  saveApi: key => ipcRenderer.invoke('setup:api', key),
  link: key => ipcRenderer.invoke('setup:link', key),
  folder: () => ipcRenderer.invoke('setup:folder'),
  onProgress: callback => ipcRenderer.on('setup:progress', (_event, message) => callback(message))
});
