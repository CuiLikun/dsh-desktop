const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { BackendService } = require('./service.cjs');
const { installPayload, readInstalled } = require('./install.cjs');
const setupFile = path.join(__dirname, 'setup.html');
const links = {
  platform: 'https://platform.deepseek.com/',
  keys: 'https://platform.deepseek.com/api_keys',
  docs: 'https://api-docs.deepseek.com/zh-cn/',
  harness: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md'
};
app.setName('DSH 安装中心');
const developmentRoot = path.join(__dirname, '..', '.local-data');
const dataRoot = app.isPackaged ? path.join(app.getPath('appData'), 'DSH Desktop') : path.join(developmentRoot, 'desktop');
app.setPath('userData', app.isPackaged ? path.join(app.getPath('appData'), 'DSH Installer') : path.join(developmentRoot, 'installer'));
const runtimeRoot = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(__dirname, '..', 'runtime');
const destinationRoot = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Programs');
const service = new BackendService(runtimeRoot, dataRoot);
let window, busy = false;
const version = app.getVersion();
function progress(message) { if (window && !window.isDestroyed()) window.webContents.send('setup:progress', message); }
service.on('status', progress);
async function state() {
  return { version, packaged: app.isPackaged, dataRoot,
    web: await readInstalled(destinationRoot, 'web', version),
    desktop: await readInstalled(destinationRoot, 'desktop', version) };
}
async function shortcuts(installed) {
  const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'DeepSeek Harness');
  await fs.mkdir(startMenu, { recursive: true });
  const write = (directory, name, options) => {
    if (!shell.writeShortcutLink(path.join(directory, name + '.lnk'), 'create', options)) throw new Error('快捷方式创建失败，可从安装目录直接启动。');
  };
  const options = installed.mode === 'web'
    ? { target: path.join(process.env.SystemRoot, 'System32', 'wscript.exe'), args: '"' + installed.entry + '"', description: '在浏览器中启动 DeepSeek Harness', cwd: installed.directory }
    : { target: installed.entry, args: '--desktop', description: 'DeepSeek Harness 桌面版', cwd: installed.directory };
  const name = installed.mode === 'web' ? 'DeepSeek Harness Web' : 'DSH Desktop';
  write(app.getPath('desktop'), name, options);
  write(startMenu, name, options);
  if (installed.mode === 'web') write(startMenu, '停止 DeepSeek Harness Web', { ...options, args: '"' + installed.entry + '" --stop' });
  else write(startMenu, 'DSH 安装中心', { target: installed.entry, args: '--setup', cwd: installed.directory });
}
async function launch(mode) {
  const installed = await readInstalled(destinationRoot, mode, version);
  if (!installed) throw new Error('请先完成对应版本的安装。');
  const env = { ...process.env };
  delete env.PORTABLE_EXECUTABLE_FILE; delete env.PORTABLE_EXECUTABLE_DIR; delete env.ELECTRON_RUN_AS_NODE;
  const command = mode === 'web' ? path.join(process.env.SystemRoot, 'System32', 'wscript.exe') : installed.entry;
  const args = mode === 'web' ? [installed.entry] : ['--desktop'];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true, cwd: installed.directory, env });
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
}
async function boot() {
  window = new BrowserWindow({ width: 1160, height: 850, minWidth: 1000, minHeight: 740, title: 'DeepSeek Harness 安装中心',
    backgroundColor: '#f6f7fb', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'setup-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  const trusted = event => event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === pathToFileURL(setupFile).href;
  const handle = (name, action) => ipcMain.handle(name, async (event, value) => {
    if (!trusted(event)) return { ok: false, error: '无效的请求来源。' };
    try { return { ok: true, value: await action(value) }; }
    catch (error) { return { ok: false, error: String(error.message).replace(/([?&]token=)[^&\s]+/g, '$1[redacted]') }; }
  });
  handle('setup:state', state);
  handle('setup:link', async key => {
    if (!Object.hasOwn(links, key)) throw new Error('无效链接。');
    await shell.openExternal(links[key]);
  });
  handle('setup:install', async mode => {
    if (busy) throw new Error('已有操作正在进行，请稍候。');
    if (!app.isPackaged) throw new Error('这是源码预览。请先生成安装包，再使用安装功能。');
    if (!['web', 'desktop'].includes(mode)) throw new Error('无效的安装选项。');
    busy = true;
    try {
      const installed = await installPayload({ source: path.dirname(process.execPath), runtimeRoot, sourceCode: __dirname,
        destinationRoot, mode, version, progress });
      if (!installed) throw new Error('安装校验失败，请重试。');
      progress('正在创建桌面和开始菜单快捷方式…');
      await shortcuts(installed);
      progress((mode === 'web' ? 'Web 版' : '桌面版') + '安装完成，可以点击启动。');
      return state();
    } finally { busy = false; }
  });
  handle('setup:launch', async mode => {
    if (!['web', 'desktop'].includes(mode)) throw new Error('无效的启动选项。');
    await launch(mode);
  });
  handle('setup:api', async value => {
    if (busy) throw new Error('已有操作正在进行，请稍候。');
    busy = true;
    try {
      await service.saveApiKey(value);
      progress('API Key 已通过官方配置接口保存，Web 版和桌面版均可使用。');
    } finally { busy = false; }
  });
  handle('setup:folder', async () => { await fs.mkdir(dataRoot, { recursive: true }); await shell.openPath(dataRoot); });
  window.on('close', event => { if (busy) { event.preventDefault(); progress('正在完成当前操作，请稍候再关闭。'); } });
  await window.loadFile(setupFile);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(boot).catch(() => app.quit());
  app.on('before-quit', () => service.stop());
  app.on('window-all-closed', () => app.quit());
}
