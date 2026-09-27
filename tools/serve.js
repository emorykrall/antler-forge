#!/usr/bin/env node
// Tiny static server so live try-on works on this computer: node serve.js, then open http://localhost:8080
// (Browsers only allow the camera on https:// or localhost.)
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = Number(process.argv[2]) || 8080;
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = path.normalize(path.join(root, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (p.endsWith(path.sep)) p = path.join(p, 'index.html');
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(port, () => console.log(`Antler Forge: http://localhost:${port}`));
