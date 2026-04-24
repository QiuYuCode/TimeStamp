const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMax'),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
  exitFullScreen: () => ipcRenderer.invoke('window:exitFullScreen'),
  getWindowState: () => ipcRenderer.invoke('window:state'),
  onWindowState: (callback) => {
    const handler = (_e, s) => callback(s);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
  close: () => ipcRenderer.invoke('window:close'),
  quit: () => ipcRenderer.invoke('app:quit')
});
