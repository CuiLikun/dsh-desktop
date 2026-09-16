const fs = require('node:fs');
const path = require('node:path');
function resolveRuntime(root) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'runtime.json'), 'utf8'));
    const command = path.resolve(root, manifest.node);
    const cli = path.resolve(root, manifest.cli);
    for (const file of [command, cli]) {
      const relative = path.relative(root, file);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(file).isFile()) throw new Error('Invalid runtime path');
    }
    return { command, cli };
  } catch {
    throw new Error('运行环境不完整。开发者请先运行 npm run prepare:runtime；安装版请重新安装 DSH Desktop。');
  }
}
function launchOptions(root, port, dataRoot, env = process.env) {
  const { command, cli } = resolveRuntime(root);
  const cleanEnv = { ...env };
  for (const key of Object.keys(cleanEnv)) {
    if (['path', 'node_options', 'node_path', 'electron_run_as_node', 'deepseek_api_key'].includes(key.toLowerCase()) || key.toUpperCase().startsWith('DSH_')) delete cleanEnv[key];
  }
  const inheritedPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  return {
    command,
    args: [cli, 'web', '--no-open', '--host', '127.0.0.1', '--port', String(port)],
    options: { cwd: path.join(dataRoot, 'workspace'), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...cleanEnv, DSH_HOME: path.join(dataRoot, 'harness'), PATH: path.dirname(command) + path.delimiter + inheritedPath } }
  };
}
function isSameOrigin(url, origin) {
  try { return new URL(url).origin === origin; } catch { return false; }
}
function isExternalUrl(url) {
  try { return ['https:', 'http:'].includes(new URL(url).protocol); } catch { return false; }
}
module.exports = { resolveRuntime, launchOptions, isSameOrigin, isExternalUrl };
