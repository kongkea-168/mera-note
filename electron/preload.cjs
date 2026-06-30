const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadNote: () => ipcRenderer.invoke('load-note'),
  saveNote: (data) => ipcRenderer.send('save-note', data),
  closeApp: () => ipcRenderer.send('close-app'),
  moveWindow: (data) => ipcRenderer.send('move-window', data)
});
