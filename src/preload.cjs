const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dshDesktop', {
  getStatus: () => ipcRenderer.invoke('dsh:get-status'),
  retry: () => ipcRenderer.invoke('dsh:retry'),
  openLogs: () => ipcRenderer.invoke('dsh:logs'),
  onStatus(callback) {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('dsh-status', listener);
    return () => ipcRenderer.removeListener('dsh-status', listener);
  }
});
