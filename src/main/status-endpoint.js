'use strict';
// status-endpoint.js — 透明桌面看板给光灵提供实时状态的 HTTP 端点
// 在看板主进程 ready 后调用 startStatusEndpoint(config, getLayoutInfo)
const http = require('http');

function startStatusEndpoint(port, getConfig) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.url === '/api/status' || req.url === '/status') {
      try {
        const cfg = getConfig();
        const cards = Object.keys((cfg && cfg.layout) || {});
        res.end(JSON.stringify({
          project: '透明桌面看板',
          status: 'running',
          layout: (cfg && cfg.layoutName) || 'default',
          cards: cards.slice(0, 10),
          summary: `布局${(cfg && cfg.layoutName) || '默认'}，${cards.length}张卡片：${cards.slice(0, 5).join('、')}`,
          ts: Date.now(),
        }));
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e.message }));
      }
    } else if (req.url === '/ping') {
      res.end(JSON.stringify({ pong: true, project: '透明桌面看板' }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`[status] 看板 listening on http://127.0.0.1:${port}/api/status`);
  });
  server.on('error', (e) => {
    if (e.code !== 'EADDRINUSE') console.warn('[status] 启动失败:', e.message);
  });
  return server;
}

module.exports = { startStatusEndpoint };
