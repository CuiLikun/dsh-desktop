// Uses a fresh project-local home and a fake API key; never sends a model request.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { launchOptions } = require('../src/runtime.cjs');
const { readBackendPage } = require('../src/backend.cjs');
const { BackendService } = require('../src/service.cjs');
const repo = path.resolve(__dirname, '..');
async function main() {
  const root = path.resolve(process.argv[2] || path.join(repo, 'runtime'));
  fs.mkdirSync(path.join(repo, '.test-data'), { recursive: true });
  const data = fs.mkdtempSync(path.join(repo, '.test-data', 'smoke-'));
  for (const name of ['workspace', 'home', 'temp', 'appdata', 'localappdata']) fs.mkdirSync(path.join(data, name));
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => { const value = probe.address().port; probe.close(() => resolve(value)); });
  });
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const env = {
    SystemRoot: systemRoot, WINDIR: systemRoot, ComSpec: path.join(systemRoot, 'System32', 'cmd.exe'),
    PATH: [path.join(systemRoot, 'System32'), path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0')].join(path.delimiter),
    USERPROFILE: path.join(data, 'home'), HOME: path.join(data, 'home'),
    APPDATA: path.join(data, 'appdata'), LOCALAPPDATA: path.join(data, 'localappdata'),
    TEMP: path.join(data, 'temp'), TMP: path.join(data, 'temp'), npm_config_cache: path.join(data, 'npm-cache'), CI: 'true'
  };
  const launch = launchOptions(root, port, data, env);
  const native = spawnSync(launch.command, [path.join(__dirname, 'smoke-native.cjs'), root], {
    cwd: launch.options.cwd, env: launch.options.env, windowsHide: true, timeout: 30000, encoding: 'utf8'
  });
  if (native.status !== 0) throw new Error('Native modules failed: ' + (native.stderr || native.error || native.stdout));
  console.log(native.stdout.trim());
  const service = new BackendService(root, data, env);
  try {
    const url = await service.start(port);
    const page = await readBackendPage(url);
    assert.ok(page, 'Authenticated Harness frontend');
    const match = page.html.match(/<script[^>]+src="([^"]+)"/);
    assert.ok(match, 'Frontend script is present');
    const asset = new URL(match[1].replaceAll('&amp;', '&'), url);
    assert.equal(asset.origin, new URL(url).origin);
    const script = await fetch(asset, { headers: { Cookie: page.cookie }, signal: AbortSignal.timeout(10000) });
    assert.equal(script.status, 200);
    assert.ok((await script.text()).length > 0);
    console.log('PASS: isolated Harness startup, token login and frontend asset.');
    await service.saveApiKey('sk-dsh-desktop-test-fixture-not-a-real-key');
    const saved = await service.rpc('credentials/describe', { refs: ['DEEPSEEK_API_KEY'] });
    assert.equal(saved.DEEPSEEK_API_KEY.configured, true);
    await service.rpc('credentials/unset', { ref: 'DEEPSEEK_API_KEY' });
    const cleared = await service.rpc('credentials/describe', { refs: ['DEEPSEEK_API_KEY'] });
    assert.equal(cleared.DEEPSEEK_API_KEY.configured, false);
    console.log('PASS: installer API writes, verifies and removes a fake key through official Harness RPC.');
  } finally { service.stop(); }
}
main().catch(error => { console.error(String(error).replace(/([?&]token=)[^&\s]+/g, '$1[redacted]')); process.exitCode = 1; });
