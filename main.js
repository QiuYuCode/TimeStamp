const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_FILE = () => path.join(app.getPath('userData'), 'timestamp-data.json');

function readData() {
  try {
    const file = DATA_FILE();
    if (!fs.existsSync(file)) return defaultData();
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...defaultData(), ...parsed };
  } catch (e) {
    console.error('readData failed:', e);
    return defaultData();
  }
}

function writeData(data) {
  try {
    const file = DATA_FILE();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('writeData failed:', e);
    return false;
  }
}

function defaultData() {
  return {
    settings: {
      accentColor: '#d4af37',
      bgColor: '#0a0a0a',
      surfaceColor: '#161616',
      textColor: '#f5f5f5',
      theme: 'black-gold'
    },
    groups: [
      { id: 'default', name: '默认分组', createdAt: Date.now() }
    ],
    sessions: []
  };
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0a0a0a',
    title: 'TimeStamp',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenu(null);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('data:load', () => readData());
ipcMain.handle('data:save', (_evt, data) => writeData(data));

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggleMax', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('app:quit', () => app.quit());
