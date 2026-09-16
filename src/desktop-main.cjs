const { app, BrowserWindow, Menu, Tray, shell, nativeImage, ipcMain } = require('electron');
const { mkdirSync, appendFileSync } = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { BackendService } = require('./service.cjs');
const { isSameOrigin, isExternalUrl } = require('./runtime.cjs');
const loading = path.join(__dirname, 'loading.html');
app.setName('DSH Desktop');
app.setPath('userData', app.isPackaged ? path.join(app.getPath('appData'), 'DSH Desktop') : path.join(__dirname, '..', '.local-data', 'desktop'));
const dataRoot = app.getPath('userData');
mkdirSync(dataRoot, { recursive: true });
app.setAppLogsPath(path.join(dataRoot, 'logs'));
const root = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(__dirname, '..', 'runtime');
const service = new BackendService(root, dataRoot);
let window, tray, quitting = false, starting = false;
let status = { state: 'starting', details: '正在准备内置运行环境…' };
function update(state, details) {
  status = { state, details };
  if (window && !window.isDestroyed()) window.webContents.send('dsh-status', status);
}
function log(message) {
  mkdirSync(app.getPath('logs'), { recursive: true });
  try { appendFileSync(path.join(app.getPath('logs'), 'dsh-desktop.log'), new Date().toISOString() + ' ' + message.replace(/([?&]token=)[^&\s]+/g, '$1[redacted]') + '\n'); } catch {}
}
service.on('status', details => update('starting', details));
service.on('stopped', details => {
  if (!starting && !quitting && window && !window.isDestroyed()) window.loadFile(loading).then(() => update('failed', details));
});
function show() { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
async function start() {
  if (starting || quitting) return;
  starting = true;
  try {
    service.stop();
    await window.loadFile(loading);
    const port = process.argv.find(arg => arg.startsWith('--port='))?.slice(7) ?? process.env.DSH_DESKTOP_PORT;
    const url = await service.start(port);
    if (!quitting) await window.loadURL(url);
  } catch (error) {
    log(String(error.message));
    if (!quitting) { await window.loadFile(loading); update('failed', '启动失败，请重试。' + error.message.replace(/([?&]token=)[^&\s]+/g, '$1[redacted]')); }
  } finally { starting = false; }
}
function open(url) { if (isExternalUrl(url)) shell.openExternal(url).catch(() => {}); }
function icon() {
  const buffer = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    const white = (x >= 8 && x <= 11 && y >= 7 && y <= 24) || (x >= 11 && x <= 20 && (y >= 7 && y <= 10 || y >= 21 && y <= 24)) || (x >= 21 && x <= 24 && y >= 10 && y <= 21);
    buffer[i] = white ? 255 : 235; buffer[i + 1] = white ? 255 : 99; buffer[i + 2] = white ? 255 : 37; buffer[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(buffer, { width: 32, height: 32 });
}
async function boot() {
  window = new BrowserWindow({ width: 1440, height: 940, minWidth: 960, minHeight: 640, show: false, title: 'DSH Desktop',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.once('ready-to-show', show);
  window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
  window.webContents.setWindowOpenHandler(({ url }) => { open(url); return { action: 'deny' }; });
  for (const eventName of ['will-navigate', 'will-redirect']) window.webContents.on(eventName, (event, url) => {
    if (!service.url || !isSameOrigin(url, new URL(service.url).origin)) { event.preventDefault(); if (eventName === 'will-navigate') open(url); }
  });
  const trusted = event => event.senderFrame?.url === pathToFileURL(loading).href;
  ipcMain.handle('dsh:get-status', event => trusted(event) ? status : null);
  ipcMain.handle('dsh:retry', event => { if (trusted(event)) void start(); });
  ipcMain.handle('dsh:logs', event => { if (trusted(event)) { mkdirSync(app.getPath('logs'), { recursive: true }); return shell.openPath(app.getPath('logs')); } });
  const items = [
    { label: '显示桌面窗口', click: show },
    { label: '在浏览器中打开', click: () => { if (service.url) open(service.url); } },
    { label: '安装中心 / 配置 API', click: () => {
      const env = { ...process.env }; delete env.PORTABLE_EXECUTABLE_FILE; delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(process.execPath, ['--setup'], { detached: true, stdio: 'ignore', windowsHide: true, env });
      child.on('error', () => {}); child.unref();
    } },
    { label: '重新启动服务', click: () => void start() }, { type: 'separator' }, { label: '退出', click: () => app.quit() }
  ];
  tray = new Tray(icon()); tray.setToolTip('DSH Desktop'); tray.on('click', show); tray.setContextMenu(Menu.buildFromTemplate(items));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '应用', submenu: items }, { label: '查看', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] }]));
  await start();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) show(); });
  app.whenReady().then(boot).catch(error => { log(String(error.message)); app.quit(); });
  app.on('before-quit', () => { quitting = true; service.stop(); });
  app.on('window-all-closed', event => event.preventDefault());
}
