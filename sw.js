// Only the generic offline screen is handled here. Account data and application
// assets always use the network: no private responses or stale bundles cached.
const OFFLINE = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f1e6"><title>MuseKnot · 等待连接</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f1e6;color:#243426;font:17px/1.8 system-ui}main{padding:28px;max-width:440px}a{color:#285a3b;display:inline-block;padding:12px 0}</style><main><p>M / K</p><h1>等网络回来，再继续</h1><p>当前无法连接 MuseKnot。本页没有读取你的记录。已提交到服务器的内容会保留；此版本需要联网才能打开和保存记录。</p><a href="./">重新连接</a></main></html>`;
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' || url.origin !== scope.origin || url.pathname !== scope.pathname) return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, {
    status:503, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}
  })));
});
// Deliberately no skipWaiting, clients.claim, cache deletion, or forced reload.
