const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "良件-空间信息共享与集成",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // 必须保持 false，否则前端无法用 require
    }
  });

  // 判断当前是开发环境还是打包后的生产环境
  const isDev = !app.isPackaged;
  if (isDev) {
    // 开发环境加载 Vite 本地服务
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools(); // 如果需要调试，取消注释
  } else {
    // 生产环境加载打包后的 dist/index.html
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});