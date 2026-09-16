const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { launchOptions } = require('./runtime.cjs');
const { extractLaunchUrl, readBackendPage } = require('./backend.cjs');
async function choosePort(requested) {
  const port = requested === undefined ? 3080 : Number(requested);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须为 1–65535 的整数。');
  for (let n = port; n <= Math.min(65535, port + (requested === undefined ? 20 : 0)); n++) {
    if (await new Promise(resolve => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(n, '127.0.0.1', () => server.close(() => resolve(true)));
    })) return n;
  }
  throw new Error('端口已被占用，请关闭冲突程序后重试。');
}
function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000, stdio: 'ignore' });
  else child.kill();
}
class BackendService extends EventEmitter {
  constructor(runtimeRoot, dataRoot, env = process.env) {
    super(); this.runtimeRoot = runtimeRoot; this.dataRoot = dataRoot; this.env = env; this.generation = 0;
  }
  start(port) {
    if (this.pending) return this.pending;
    if (this.url && this.child?.exitCode === null) return Promise.resolve(this.url);
    this.pending = this.boot(port).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  async boot(port) {
    const generation = ++this.generation;
    this.emit('status', '正在启动内置 DeepSeek Harness…');
    const selected = await choosePort(port);
    if (generation !== this.generation) throw new Error('启动已取消。');
    mkdirSync(path.join(this.dataRoot, 'workspace'), { recursive: true });
    const launch = launchOptions(this.runtimeRoot, selected, this.dataRoot, this.env);
    const child = spawn(launch.command, launch.args, launch.options);
    this.child = child;
    let output = '', announced, failure;
    child.stdout.on('data', chunk => {
      if (announced) return;
      output = (output + chunk).slice(-16000);
      const end = output.lastIndexOf('\n');
      if (end >= 0) announced = extractLaunchUrl(output.slice(0, end + 1), 'http://127.0.0.1:' + selected);
      if (announced) output = '';
    });
    child.stderr.resume();
    child.once('error', error => { failure = '运行环境启动失败（' + (error.code || 'UNKNOWN') + '）。'; });
    child.once('exit', code => {
      failure = 'Harness 已退出（代码 ' + code + '）。请重试或重新安装。';
      if (this.child === child) { this.url = undefined; this.emit('stopped', failure); }
    });
    try {
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline && generation === this.generation) {
        if (failure) throw new Error(failure);
        if (announced) {
          let ready;
          try { ready = await readBackendPage(announced); } catch {}
          if (ready && child.exitCode === null && generation === this.generation) {
            this.url = announced;
            this.emit('status', 'Harness 已就绪');
            return announced;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      throw new Error(generation !== this.generation ? '启动已取消。' : '启动超时，请重新启动；如持续失败，请检查应用数据目录中的配置。');
    } catch (error) {
      if (this.child === child) this.stop();
      throw error;
    }
  }
  stop() {
    ++this.generation;
    const child = this.child;
    this.child = undefined;
    this.url = undefined;
    stopProcess(child);
  }
  async rpc(method, args) {
    const url = await this.start();
    const page = await readBackendPage(url);
    if (!page) throw new Error('无法连接本地配置服务，请重试。');
    const origin = new URL(url).origin;
    const response = await fetch(origin + '/api/' + method, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: page.cookie },
      body: JSON.stringify({ type: 'client-request', rpcId: 'setup-' + Date.now(), method, payload: { args } })
    });
    if (!response.ok) throw new Error('本地配置服务返回 HTTP ' + response.status);
    const body = await response.json();
    if (!body.result?.ok) throw new Error('Harness 未能保存配置，请在 Models 设置中检查配置是否为只读。');
    return body.result.value;
  }
  async saveApiKey(value) {
    const key = typeof value === 'string' ? value.trim() : '';
    if (!/^[\x21-\x7e]{8,512}$/.test(key)) throw new Error('请粘贴完整的 API Key，不能包含空格或换行。');
    await this.rpc('credentials/set', { ref: 'DEEPSEEK_API_KEY', value: key });
    const state = await this.rpc('credentials/describe', { refs: ['DEEPSEEK_API_KEY'] });
    if (!state?.DEEPSEEK_API_KEY?.configured) throw new Error('API Key 保存状态未确认，请重试。');
  }
}
module.exports = { BackendService, choosePort, stopProcess };
