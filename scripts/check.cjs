const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const directory of ['src', 'scripts', 'test']) {
  for (const file of fs.readdirSync(path.join(root, directory))) {
    if (!/\.(cjs|js)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(root, directory, file)], { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('All JavaScript syntax checks passed.');
