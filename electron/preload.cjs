const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('knowledgeGraphDesktop', {
  isElectron: true,
  chooseSyncFile: () => ipcRenderer.invoke('sync:choose-file'),
  writeSyncFile: (filePath, contents) =>
    ipcRenderer.invoke('sync:write-file', { filePath, contents }),
})
