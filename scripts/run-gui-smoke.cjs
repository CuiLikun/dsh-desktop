const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const data = path.join(root, '.test-data', 'gui');
for (const name of ['home', 'appdata', 'localappdata', 'temp']) fs.mkdirSync(path.join(data, name), { recursive: true });
const env = { ...process.env, HOME: path.join(data, 'home'), USERPROFILE: path.join(data, 'home'),
  APPDATA: path.join(data, 'appdata'), LOCALAPPDATA: path.join(data, 'localappdata'),
  TEMP: path.join(data, 'temp'), TMP: path.join(data, 'temp') };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), [path.join(__dirname, 'gui-smoke.cjs'), data, ...process.argv.slice(2)], {
  cwd: root, env, windowsHide: true, stdio: 'inherit', timeout: 90000
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
