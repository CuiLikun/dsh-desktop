const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { installPayload, readInstalled, installDirectory } = require('../src/install.cjs');
const parent = path.resolve(__dirname, '..', '.test-data');
async function fixture() {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'install-'));
  const source = path.join(root, 'payload');
  const runtimeRoot = path.join(source, 'resources', 'runtime');
  await fs.mkdir(path.join(runtimeRoot, 'node'), { recursive: true });
  await fs.writeFile(path.join(runtimeRoot, 'node', 'node.exe'), 'fixture node');
  await fs.writeFile(path.join(runtimeRoot, 'cli.js'), 'fixture harness');
  await fs.writeFile(path.join(runtimeRoot, 'runtime.json'), JSON.stringify({ node: 'node/node.exe', cli: 'cli.js' }));
  await fs.writeFile(path.join(source, 'DSH Desktop.exe'), 'fixture desktop');
  return { source, runtimeRoot, sourceCode: path.resolve(__dirname, '..', 'src'), destinationRoot: path.join(root, 'installed'), version: '0.2.0' };
}
test('web-only installs runtime and launchers without desktop; repeated install is idempotent', async () => {
  const options = { ...await fixture(), mode: 'web' };
  const result = await installPayload(options);
  assert.equal(result.mode, 'web');
  await fs.access(path.join(result.directory, 'runtime', 'node', 'node.exe'));
  await fs.access(path.join(result.directory, 'src', 'service.cjs'));
  await assert.rejects(fs.access(path.join(result.directory, 'DSH Desktop.exe')));
  const launcher = await fs.readFile(result.entry, 'utf8');
  assert.match(launcher, /GetParentFolderName/);
  assert.doesNotMatch(launcher, /\.install-/);
  assert.deepEqual(await installPayload(options), result);
});
test('desktop installs full payload with bundled runtime', async () => {
  const options = { ...await fixture(), mode: 'desktop' };
  const result = await installPayload(options);
  assert.equal(await fs.readFile(result.entry, 'utf8'), 'fixture desktop');
  assert.deepEqual(await readInstalled(options.destinationRoot, 'desktop', options.version), result);
});
test('unrelated installation folder is never overwritten', async () => {
  const options = { ...await fixture(), mode: 'web' };
  const directory = installDirectory(options.destinationRoot, options.mode, options.version);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'keep.txt'), 'user data');
  await assert.rejects(installPayload(options), /目录已存在/);
  assert.equal(await fs.readFile(path.join(directory, 'keep.txt'), 'utf8'), 'user data');
});
test('invalid mode and version cannot escape installation root', () => {
  assert.throws(() => installDirectory(parent, '../elsewhere', '0.2.0'));
  assert.throws(() => installDirectory(parent, 'web', '../../elsewhere'));
});
