const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

app.commandLine.appendSwitch('enable-experimental-web-platform-features')

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      experimentalFeatures: true
    }
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('choose-files', async (event) => {
  const res = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]
  })
  return res.canceled ? [] : res.filePaths
})

ipcMain.handle('choose-folder', async (event) => {
  const res = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (res.canceled || !res.filePaths || res.filePaths.length === 0) return []
  const folder = res.filePaths[0]
  try {
    const files = fs.readdirSync(folder)
      .filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f))
      .map(f => path.join(folder, f))
    return files
  } catch (e) {
    return []
  }
})

// yt-dlp audio URL extraction for Electron desktop (returns direct audio URL)
ipcMain.handle('yt-dlp-audio', async (event, url) => {
  return new Promise((resolve) => {
    if (!url) return resolve({ ok: false, error: 'No URL' })
    // try common executable names
    const cmds = ['yt-dlp', 'yt-dlp.exe', 'yt-dlp.exe']
    const argsBase = ['-f', 'bestaudio', '-g', url]
    const tryCmd = (i) => {
      if (i >= cmds.length) return resolve({ ok: false, error: 'yt-dlp not found in PATH' })
      const cmd = cmds[i]
      execFile(cmd, argsBase, { timeout: 15000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err || !stdout) {
          // try next
          return tryCmd(i + 1)
        }
        const link = stdout.toString().trim().split(/\r?\n/)[0]
        if (!link) return resolve({ ok: false, error: 'No link from yt-dlp' })
        resolve({ ok: true, url: link })
      })
    }
    tryCmd(0)
  })
})
