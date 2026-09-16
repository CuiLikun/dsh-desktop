// Hidden renderer test. IPC actions are fakes: never installs software or opens a browser.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const data = process.argv[2];
const sourceRoot = process.argv.includes('--packaged')
  ? path.resolve(__dirname, '../dist/win-unpacked/resources/app.asar/src')
  : path.resolve(__dirname, '../src');
app.setPath('userData', path.join(data, 'profile'));
app.disableHardwareAcceleration();
let window;
app.whenReady().then(async () => {
  // Exercise the real install copier under Electron, including app.asar handling.
  const raw = require('original-fs');
  const fixture = raw.mkdtempSync(path.join(data, 'copy-'));
  const payload = path.join(fixture, 'payload');
  const runtime = path.join(payload, 'resources', 'runtime');
  raw.mkdirSync(runtime, { recursive: true });
  raw.writeFileSync(path.join(runtime, 'node.exe'), 'fixture');
  raw.writeFileSync(path.join(runtime, 'cli.js'), 'fixture');
  raw.writeFileSync(path.join(runtime, 'runtime.json'), JSON.stringify({ node: 'node.exe', cli: 'cli.js' }));
  raw.writeFileSync(path.join(payload, 'DSH Desktop.exe'), 'fixture');
  raw.writeFileSync(path.join(payload, 'resources', 'app.asar'), 'archive-fixture');
  const { installPayload } = require(path.join(sourceRoot, 'install.cjs'));
  const options = { source: payload, runtimeRoot: runtime, sourceCode: sourceRoot, destinationRoot: path.join(fixture, 'installed'), version: '0.2.0' };
  const desktop = await installPayload({ ...options, mode: 'desktop' });
  assert.equal(raw.readFileSync(path.join(desktop.directory, 'resources', 'app.asar'), 'utf8'), 'archive-fixture');
  const web = await installPayload({ ...options, mode: 'web' });
  assert.ok(raw.existsSync(path.join(web.directory, 'src', 'service.cjs')));
  assert.equal(raw.existsSync(path.join(web.directory, 'DSH Desktop.exe')), false);
  console.log('PASS: Electron installation copier preserves app.asar; web-only source extraction succeeds.');
  const state = { version: '0.2.0', packaged: true, web: null, desktop: null };
  const actions = [];
  const result = value => ({ ok: true, value });
  ipcMain.handle('setup:state', () => result(state));
  ipcMain.handle('setup:install', (_event, mode) => {
    actions.push(['install', mode]); state[mode] = { version: '0.2.0' }; return result(state);
  });
  ipcMain.handle('setup:launch', (_event, mode) => { actions.push(['launch', mode]); return result(); });
  ipcMain.handle('setup:link', (_event, key) => { actions.push(['link', key]); return result(); });
  ipcMain.handle('setup:api', (_event, key) => { assert.equal(key, 'fake-gui-test-key'); actions.push(['save']); return result(); });
  window = new BrowserWindow({ width: 1160, height: 850, show: false,
    webPreferences: { preload: path.join(sourceRoot, 'setup-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  const js = code => window.webContents.executeJavaScript(code);
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) { if (await js(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
    throw new Error('GUI condition timed out: ' + expression);
  }
  await window.loadFile(path.join(sourceRoot, 'setup.html'));
  await waitFor("document.querySelector('#version').textContent === 'v0.2.0'");
  assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'No horizontal overflow');
  await new Promise(resolve => setTimeout(resolve, 250));
  fs.writeFileSync(path.join(data, 'installer.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  // Capture documentation images before simulated installs or credential entry.
  for (const view of ['api', 'help']) {
    await js(`document.querySelector('[data-view=${view}]').click()`);
    await waitFor(`getComputedStyle(document.querySelector('#view-${view}')).display !== 'none'`);
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await new Promise(resolve => setTimeout(resolve, 500));
    fs.writeFileSync(path.join(data, view + '.png'), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  }
  await js("document.querySelector('[data-view=install]').click()");
  for (const mode of ['web', 'desktop']) {
    await js(`document.querySelector('.install-button[data-mode="${mode}"]').click()`);
    await waitFor(`!document.querySelector('#launch-${mode}').classList.contains('hidden')`);
    await waitFor(`!document.querySelector('#launch-${mode}').disabled`);
    await js(`document.querySelector('#launch-${mode}').click()`);
    await waitFor(`!document.querySelector('#launch-${mode}').disabled`);
  }
  await js("document.querySelector('[data-view=api]').click()");
  await waitFor("getComputedStyle(document.querySelector('#view-api')).display !== 'none'");
  await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await new Promise(resolve => setTimeout(resolve, 500));
  await js("document.querySelector('#api-key').value='fake-gui-test-key'; document.querySelector('#api-form').requestSubmit()");
  await waitFor("document.querySelector('#api-result').classList.contains('success')");
  assert.equal(await js("document.querySelector('#api-key').value"), '', 'Key is cleared after saving');
  for (const key of ['platform', 'keys', 'docs']) await js(`document.querySelector('[data-link=${key}]').click()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const mode of ['web', 'desktop']) {
    assert.ok(actions.some(item => item[0] === 'install' && item[1] === mode));
    assert.ok(actions.some(item => item[0] === 'launch' && item[1] === mode));
  }
  for (const key of ['platform', 'keys', 'docs']) assert.ok(actions.some(item => item[0] === 'link' && item[1] === key));
  assert.ok(actions.some(item => item[0] === 'save'));
  console.log('PASS: GUI navigation, both install/launch buttons, API form and official-link buttons.');
  console.log('Screenshots: ' + data);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
