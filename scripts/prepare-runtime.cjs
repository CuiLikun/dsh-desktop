const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'runtime');
const version = '24.21.0';
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(url + ': HTTP ' + response.status);
  return Buffer.from(await response.arrayBuffer());
}
async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64 with Node.js 24.');
  const name = 'node-v' + version + '-win-x64';
  const base = 'https://nodejs.org/dist/v' + version + '/';
  const archive = path.join(runtime, name + '.zip');
  const binary = path.join(runtime, name, 'node.exe');
  if (!fs.existsSync(binary)) {
    console.log('Downloading official Node.js ' + version + ' runtime…');
    const [zip, sums] = await Promise.all([download(base + name + '.zip'), download(base + 'SHASUMS256.txt')]);
    const line = sums.toString().split('\n').find(line => line.trim().endsWith('  ' + name + '.zip'));
    const expected = line?.split(/\s+/)[0];
    if (!expected || crypto.createHash('sha256').update(zip).digest('hex') !== expected) throw new Error('Node.js SHA256 verification failed.');
    fs.writeFileSync(archive, zip);
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    const extraction = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Expand-Archive -LiteralPath ' + quote(archive) + ' -DestinationPath ' + quote(runtime) + ' -Force'], { stdio: 'inherit', windowsHide: true });
    if (extraction.status !== 0) throw new Error('Node.js extraction failed.');
    fs.unlinkSync(archive);
  }
  const result = spawnSync(binary, [path.join(runtime, name, 'node_modules/npm/bin/npm-cli.js'),
    'ci', '--omit=dev', '--no-audit', '--no-fund', '--cache', path.join(root, '.cache', 'npm')], {
    cwd: runtime, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, PATH: path.dirname(binary) + path.delimiter + process.env.PATH }
  });
  if (result.status !== 0) throw new Error('Harness dependency installation failed.');
  fs.writeFileSync(path.join(runtime, 'runtime.json'), JSON.stringify({
    node: name + '/node.exe', cli: 'node_modules/@deepseek-ai/dsh/lib/bin.js',
    nodeVersion: version, harnessVersion: require('../runtime/package.json').dependencies['@deepseek-ai/dsh']
  }, null, 2) + '\n');
  console.log('Bundled runtime ready.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
