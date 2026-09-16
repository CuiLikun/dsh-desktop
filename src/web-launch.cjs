const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { BackendService } = require('./service.cjs');
const dataRoot = path.join(process.env.APPDATA, 'DSH Desktop');
const pipe = '\\\\.\\pipe\\dsh-web-' + crypto.createHash('sha256').update(dataRoot).digest('hex').slice(0, 20);
const stopping = process.argv.includes('--stop');
async function signalExisting() {
  return new Promise(resolve => {
    const socket = net.connect(pipe);
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.end(stopping ? 'stop' : 'open'); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
async function main() {
  if (await signalExisting() || stopping) return;
  const service = new BackendService(path.join(__dirname, '..', 'runtime'), dataRoot);
  const open = () => {
    if (!service.url) return;
    // Windows URL handler, only for the validated loopback URL emitted by our own backend.
    const child = spawn(path.join(process.env.SystemRoot, 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', service.url], { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => {});
  };
  const server = net.createServer(socket => {
    let message = '';
    socket.setTimeout(2000, () => socket.destroy());
    socket.on('data', chunk => { message = (message + chunk).slice(0, 16); });
    socket.on('end', () => {
      if (message === 'stop') { service.stop(); server.close(); }
      else if (message === 'open') open();
    });
    socket.on('error', () => {});
  });
  server.on('error', () => { service.stop(); });
  service.on('stopped', () => server.close());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
  try { await service.start(); open(); }
  catch (error) { service.stop(); server.close(); throw error; }
}
main().catch(() => {
  // Show the failure only to the person launching the application.
  const helper = spawn('wscript.exe', [path.join(__dirname, '..', 'startup-error.vbs')], { windowsHide: true, stdio: 'ignore' });
  helper.on('error', () => {}); process.exitCode = 1;
});
