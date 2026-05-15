const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  chooseFiles: () => ipcRenderer.invoke('choose-files'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  // allow ipcRenderer to send/receive simple messages if needed
  on: (channel, cb) => ipcRenderer.on(channel, cb)
})

// expose yt-dlp helper
contextBridge.exposeInMainWorld('yt', {
  getAudioUrl: (url) => ipcRenderer.invoke('yt-dlp-audio', url)
})
