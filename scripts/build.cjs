const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temp = path.join(root, '.cache', 'temp');
fs.mkdirSync(temp, { recursive: true });
// Cache and temporary variables apply only to this build child, never to Windows settings.
const result = spawnSync(process.execPath, [
  require.resolve('electron-builder/cli.js'), '--win', ...process.argv.slice(2), '--x64', '--publish', 'never'
], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, ELECTRON_CACHE: path.join(root, '.cache', 'electron'),
    ELECTRON_BUILDER_CACHE: path.join(root, '.cache', 'electron-builder'),
    npm_config_cache: path.join(root, '.cache', 'npm'), TEMP: temp, TMP: temp }
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
if (result.status === 0) {
  const checksums = spawnSync(process.execPath, [path.join(__dirname, 'checksums.cjs')], { cwd: root, stdio: 'inherit', windowsHide: true });
  process.exitCode = checksums.status ?? 1;
}
