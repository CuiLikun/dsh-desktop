const fs = require('node:fs/promises');
const path = require('node:path');
const { resolveRuntime } = require('./runtime.cjs');
function installDirectory(root, mode, version) {
  if (!['web', 'desktop'].includes(mode) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error('安装选项无效。');
  return path.join(root, mode === 'web' ? 'DSH Web' : 'DSH Desktop', version);
}
async function readInstalled(root, mode, version) {
  const directory = installDirectory(root, mode, version);
  try {
    const marker = JSON.parse(await fs.readFile(path.join(directory, 'dsh-install.json'), 'utf8'));
    if (marker.product !== 'dsh-desktop' || marker.mode !== mode || marker.version !== version) return null;
    const entry = path.join(directory, mode === 'web' ? 'launch-web.vbs' : 'DSH Desktop.exe');
    await fs.access(entry);
    resolveRuntime(path.join(directory, mode === 'web' ? 'runtime' : 'resources/runtime'));
    return { mode, directory, entry, version };
  } catch { return null; }
}
async function installPayload({ source, runtimeRoot, sourceCode, destinationRoot, mode, version, progress = () => {} }) {
  const existing = await readInstalled(destinationRoot, mode, version);
  if (existing) { progress('安装文件已就绪，正在修复快捷方式…'); return existing; }
  const directory = installDirectory(destinationRoot, mode, version);
  // Refuse an existing incomplete or foreign folder; never overwrite or recursively delete it.
  try { await fs.access(directory); throw new Error('安装目录已存在但不完整，请先将该目录改名后重试：' + directory); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(directory), { recursive: true });
  const staging = await fs.mkdtemp(path.join(path.dirname(directory), '.install-'));
  progress('正在复制内置 Node.js 和 Harness，请稍候…');
  if (mode === 'web') {
    await fs.cp(runtimeRoot, path.join(staging, 'runtime'), { recursive: true, dereference: true });
    await fs.mkdir(path.join(staging, 'src'));
    for (const file of ['runtime.cjs', 'backend.cjs', 'service.cjs', 'web-launch.cjs']) await fs.copyFile(path.join(sourceCode, file), path.join(staging, 'src', file));
    const manifest = resolveRuntime(path.join(staging, 'runtime'));
    const nodeRelative = path.relative(staging, manifest.command);
    // VBScript resolves its own installed path, so staging names never enter shortcuts.
    const script = [
      'Set sh = CreateObject("WScript.Shell")',
      'Set fso = CreateObject("Scripting.FileSystemObject")',
      'base = fso.GetParentFolderName(WScript.ScriptFullName)',
      'cmd = Chr(34) & base & "\\' + nodeRelative + '" & Chr(34) & " " & Chr(34) & base & "\\src\\web-launch.cjs" & Chr(34)',
      'If WScript.Arguments.Count > 0 Then',
      '  If WScript.Arguments(0) = "--stop" Then cmd = cmd & " --stop"',
      'End If',
      'sh.Run cmd, 0, False'
    ].join('\r\n');
    await fs.writeFile(path.join(staging, 'launch-web.vbs'), script, 'utf8');
    await fs.writeFile(path.join(staging, 'startup-error.vbs'), Buffer.from('\ufeffMsgBox "DeepSeek Harness 启动失败，请重新打开安装中心检查配置或重新安装。", 16, "DeepSeek Harness"\r\n', 'utf16le'));
    await fs.writeFile(path.join(staging, '使用说明.txt'), '双击 launch-web.vbs 打开浏览器版。API 配置请重新打开 DSH 安装中心。\r\n卸载：停止 Web 服务后，删除本目录及对应快捷方式。用户数据默认保留在 %APPDATA%\\DSH Desktop。\r\n');
  } else {
    if (!source) throw new Error('请运行打包后的安装中心。');
    // Electron's patched fs treats app.asar as a virtual directory. Copy the
    // archive as a real file so the installed desktop remains launchable.
    const nativeFs = process.versions.electron ? require('original-fs').promises : fs;
    await nativeFs.cp(source, staging, { recursive: true, dereference: true });
  }
  resolveRuntime(path.join(staging, mode === 'web' ? 'runtime' : 'resources/runtime'));
  await fs.writeFile(path.join(staging, 'dsh-install.json'), JSON.stringify({ product: 'dsh-desktop', mode, version }, null, 2));
  progress('正在完成安装…');
  await fs.rename(staging, directory);
  return readInstalled(destinationRoot, mode, version);
}
module.exports = { installDirectory, readInstalled, installPayload };
