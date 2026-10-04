const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// 🚨 核心修复：设置 AppUserModelID，让 Windows 任务栏识别此应用，避免被系统强制同化
app.setAppUserModelId('com.liangjian.app');

// ================= 1. 定义全中文的原生菜单模板 =================
const menuTemplate = [
  {
    label: '文件',
    submenu: [
      { label: '退出', role: 'quit' }
    ]
  },
  {
    label: '编辑',
    submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' }
    ]
  },
  {
    label: '视图',
    submenu: [
      { label: '重新加载', role: 'reload' },
      { label: '强制重新加载', role: 'forceReload' },
      { label: '开发者工具', role: 'toggleDevTools' },
      { type: 'separator' },
      { label: '实际大小', role: 'resetZoom' },
      { label: '放大', role: 'zoomIn' },
      { label: '缩小', role: 'zoomOut' },
      { type: 'separator' },
      { label: '全屏切换', role: 'togglefullscreen' }
    ]
  },
  {
    label: '窗口',
    submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '关闭', role: 'close' }
    ]
  }
];

// ================= 2. 创建应用窗口 =================
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "良件-空间信息共享与集成",
    // 🚨 核心修复：使用绝对路径加载图标
    icon: path.join(__dirname, 'public', 'icon.png'), 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false 
    }
  });

  // ⚠️ 强行锁死窗口标题，防止被网页标题覆盖
  win.on('page-title-updated', (e) => e.preventDefault());

  // 判断当前是开发环境还是打包后环境
  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

// ================= 3. 应用菜单与启动 =================
app.whenReady().then(() => {
  // 构建并设置应用菜单
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});