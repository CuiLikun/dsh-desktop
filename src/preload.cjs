const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshDesktop', {
  onStatus(callback) {
    ipcRenderer.on('dsh-status', (_event, status) => callback(status));
  }
});
