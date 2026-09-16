function render(status) {
  if (!status) return;
  document.body.classList.toggle('failed', status.state === 'failed');
  document.querySelector('#title').textContent = status.state === 'failed' ? '暂时无法启动' : '正在打开 DeepSeek Harness';
  document.querySelector('#detail').textContent = status.details;
}
window.dshDesktop.onStatus(render);
window.dshDesktop.getStatus().then(render);
document.querySelector('#retry').addEventListener('click', () => window.dshDesktop.retry());
document.querySelector('#logs').addEventListener('click', () => window.dshDesktop.openLogs());
