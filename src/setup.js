let currentState, busy = false;
const statusBar = document.querySelector('.status-bar');
function message(text, error = false) {
  document.querySelector('#status-text').textContent = text;
  statusBar.classList.toggle('error', error);
}
function setBusy(value) {
  busy = value; statusBar.classList.toggle('busy', value);
  document.querySelectorAll('.install-button,.launch-button,#save-api').forEach(button => { button.disabled = value; });
}
function render(state) {
  currentState = state;
  document.querySelector('#version').textContent = 'v' + state.version;
  for (const mode of ['web', 'desktop']) {
    const installed = Boolean(state[mode]);
    const label = document.querySelector('#state-' + mode);
    label.textContent = installed ? '✓ 已安装 · v' + state.version : '准备好安装';
    label.classList.toggle('installed', installed);
    document.querySelector('#launch-' + mode).classList.toggle('hidden', !installed);
    const button = document.querySelector('.install-button[data-mode="' + mode + '"]');
    button.textContent = installed ? '检查安装 / 修复快捷方式' : '一键安装' + (mode === 'web' ? ' Web 版 ↓' : '桌面版 ↓');
  }
  if (!state.packaged) message('源码预览模式：可查看界面；安装功能需使用生成的安装包。');
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.view;
  document.querySelectorAll('.view').forEach(section => section.classList.toggle('hidden', section.id !== 'view-' + view));
  document.querySelectorAll('.nav').forEach(nav => nav.classList.toggle('active', nav.dataset.view === view));
}));
document.querySelectorAll('[data-link]').forEach(button => button.addEventListener('click', async () => {
  const result = await window.setup.link(button.dataset.link);
  if (!result.ok) message(result.error, true);
}));
document.querySelectorAll('.install-button').forEach(button => button.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); message('正在准备安装…');
  try {
    const result = await window.setup.install(button.dataset.mode);
    if (!result.ok) message(result.error, true);
    else { render(result.value); message('安装完成。你可以配置 API，或直接点击启动。'); }
  } finally { setBusy(false); }
}));
document.querySelectorAll('[data-launch]').forEach(button => button.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try {
    const result = await window.setup.launch(button.dataset.launch);
    message(result.ok ? '已发送启动请求，应用将自动打开。' : result.error, !result.ok);
  } finally { setBusy(false); }
}));
document.querySelector('#api-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const input = document.querySelector('#api-key');
  const resultLabel = document.querySelector('#api-result');
  resultLabel.className = 'hint'; resultLabel.textContent = '正在连接本地配置服务并保存…';
  setBusy(true);
  try {
    const result = await window.setup.saveApi(input.value);
    if (result.ok) {
      input.value = ''; input.type = 'password'; document.querySelector('#toggle-key').textContent = '显示';
      resultLabel.className = 'hint success';
      resultLabel.textContent = '✓ 已保存，Web 版和桌面版均可使用。尚未在线验证 Key 或账户额度。';
    } else { resultLabel.className = 'hint failure'; resultLabel.textContent = result.error; message(result.error, true); }
  } finally { setBusy(false); }
});
document.querySelector('#toggle-key').addEventListener('click', () => {
  const input = document.querySelector('#api-key');
  const show = input.type === 'password'; input.type = show ? 'text' : 'password';
  const button = document.querySelector('#toggle-key'); button.textContent = show ? '隐藏' : '显示';
  button.setAttribute('aria-label', show ? '隐藏 API Key' : '显示 API Key');
});
document.querySelector('#open-data').addEventListener('click', async () => {
  const result = await window.setup.folder(); if (!result.ok) message(result.error, true);
});
window.setup.onProgress(text => message(text));
window.setup.state().then(result => { if (result.ok) render(result.value); else message(result.error, true); });
