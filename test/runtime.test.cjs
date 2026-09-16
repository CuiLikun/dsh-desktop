const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveRuntime, launchOptions, isSameOrigin, isExternalUrl } = require('../src/runtime.cjs');
const parent = path.resolve(__dirname, '..', '.test-data');
fs.mkdirSync(parent, { recursive: true });
const root = fs.mkdtempSync(path.join(parent, 'runtime-'));
fs.mkdirSync(path.join(root, 'node'));
fs.writeFileSync(path.join(root, 'node', 'node.exe'), '');
fs.writeFileSync(path.join(root, 'cli.js'), '');
fs.writeFileSync(path.join(root, 'runtime.json'), JSON.stringify({ node: 'node/node.exe', cli: 'cli.js' }));
// Fixtures remain in the ignored project directory; no recursive cleanup outside it.
test('launch uses isolated data, explicit loopback and no shell without changing parent env', () => {
  const env = { Path: 'existing-path', NODE_OPTIONS: '--inspect', NODE_PATH: 'other', ELECTRON_RUN_AS_NODE: '1', DSH_HOME: 'existing-profile', DSH_TOOLS_MODE: 'other', DEEPSEEK_API_KEY: 'existing-key', KEEP: 'value' };
  const snapshot = { ...env };
  const launch = launchOptions(root, 3081, path.join(root, 'data with spaces'), env);
  assert.equal(launch.options.shell, false);
  assert.deepEqual(launch.args.slice(1), ['web', '--no-open', '--host', '127.0.0.1', '--port', '3081']);
  assert.equal(launch.options.env.DSH_HOME, path.join(root, 'data with spaces', 'harness'));
  assert.equal(launch.options.cwd, path.join(root, 'data with spaces', 'workspace'));
  assert.equal(launch.options.env.NODE_OPTIONS, undefined);
  assert.equal(launch.options.env.Path, undefined);
  assert.equal(launch.options.env.NODE_PATH, undefined);
  assert.equal(launch.options.env.DSH_TOOLS_MODE, undefined);
  assert.equal(launch.options.env.DEEPSEEK_API_KEY, undefined);
  assert.equal(launch.options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(launch.options.env.KEEP, 'value');
  assert.equal(launch.options.env.PATH, path.join(root, 'node') + path.delimiter + 'existing-path');
  assert.deepEqual(env, snapshot);
});
test('missing runtime gives actionable error', () => {
  assert.throws(() => resolveRuntime(path.join(root, 'absent')), /prepare:runtime/);
});
test('manifest cannot launch a path outside runtime', () => {
  const bad = path.join(root, 'bad');
  fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'runtime.json'), JSON.stringify({ node: '../node/node.exe', cli: '../cli.js' }));
  assert.throws(() => resolveRuntime(bad), /运行环境不完整/);
});
test('navigation compares actual origins and rejects privileged external protocols', () => {
  const origin = 'http://127.0.0.1:3080';
  assert.equal(isSameOrigin(origin + '/settings', origin), true);
  for (const url of [origin + '.evil.test', origin + '@evil.test', 'http://127.0.0.1:30801', 'file:///C:/secret', 'invalid']) {
    assert.equal(isSameOrigin(url, origin), false, url);
  }
  for (const url of ['file:///C:/Windows/system32/cmd.exe', 'javascript:alert(1)', 'ms-settings:']) assert.equal(isExternalUrl(url), false);
  assert.equal(isExternalUrl('https://platform.deepseek.com/'), true);
});
