const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const DEFAULT_PORT = 3080;
const START_TIMEOUT_MS = 45_000;

let mainWindow;
let tray;
let dshProcess;
let ownsDshProcess = false;
let quitting = false;

function readPort() {
  const option = process.argv.find((arg) => arg.startsWith('--port='));
  const port = Number(option?.slice('--port='.length) ?? process.env.DSH_DESKTOP_PORT ?? DEFAULT_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

const port = readPort();
const serverUrl = `http://127.0.0.1:${port}`;

function writeLog(message) {
  try {
    appendFileSync(path.join(app.getPath('logs'), 'dsh-desktop.log'), `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Diagnostics must never prevent the application from starting.
  }
}

function createTrayIcon() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#2563eb"/>
      <path d="M18 18h17c7 0 12 5 12 12v4c0 7-5 12-12 12H18z" fill="#fff"/>
      <path d="M25 26h10M25 32h14M25 38h8" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round"/>
    </svg>`);
  return nativeImage.createFromDataURL(`data:image/svg+xml,${svg}`);
}

function isServerReachable() {
  return new Promise((resolve) => {
    const request = http.get(serverUrl, { timeout: 1500 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isServerReachable()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function launchDsh() {
  const command = process.env.DSH_COMMAND || (process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
  const args = ['--profile', 'web', '--port', String(port)];
  const options = {
    cwd: app.getPath('home'),
    detached: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  };

  // `.cmd` launchers need a command shell on Windows; elsewhere invoke dsh directly.
  dshProcess = spawn(command, args, { ...options, shell: process.platform === 'win32' });
  ownsDshProcess = true;
  writeLog(`Starting ${command} on ${serverUrl}.`);

  let errorOutput = '';
  dshProcess.stdout.on('data', (chunk) => writeLog(chunk.toString().trim()));
  dshProcess.stderr.on('data', (chunk) => {
    errorOutput = (errorOutput + chunk).slice(-4000);
    writeLog(chunk.toString().trim());
  });
  dshProcess.on('error', (error) => {
    errorOutput = error.message;
    writeLog(`Process error: ${error.message}`);
  });
  dshProcess.on('exit', (code) => {
    writeLog(`dsh exited with code ${code ?? 'unknown'}.`);
    if (!quitting && code && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dsh-status', { state: 'stopped', details: errorOutput || `dsh exited with code ${code}` });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: 'DSH Desktop',
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(serverUrl)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(serverUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('DSH Desktop');
  tray.on('click', showWindow);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show DSH Desktop', click: showWindow },
    { type: 'separator' },
    { label: 'Open in browser', click: () => shell.openExternal(serverUrl) },
    { label: 'Quit', click: () => app.quit() }
  ]));
}

async function boot() {
  createWindow();
  createTray();
  await mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  if (!(await isServerReachable())) launchDsh();
  if (await waitForServer()) {
    await mainWindow.loadURL(serverUrl);
  } else {
    mainWindow.webContents.send('dsh-status', {
      state: 'failed',
      details: 'Could not start DeepSeek Harness. Confirm that `dsh` is installed and available in PATH.'
    });
  }
}

app.setName('DSH Desktop');
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', showWindow);
app.whenReady().then(boot);
app.on('window-all-closed', (event) => event.preventDefault());
app.on('before-quit', () => {
  quitting = true;
  if (ownsDshProcess && dshProcess && !dshProcess.killed) dshProcess.kill();
});
