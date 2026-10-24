import { createServer, get } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const port = 5180;
const url = `http://127.0.0.1:${port}/`;
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.csv':'application/octet-stream', '.png':'image/png' };
const openBrowser = () => { if (process.argv.includes('--no-open')) return; spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' }).unref(); };
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  try {
    const path = decodeURIComponent(new URL(req.url, url).pathname);
    const target = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'X-Ladder-Viewer':'prototype' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
});
server.on('error', error => {
  if (error.code !== 'EADDRINUSE') { console.error(error.message); process.exitCode=1; return; }
  get(url, res => { if (res.headers['x-ladder-viewer'] === 'prototype') openBrowser(); else { console.error(`Port ${port} is used by another application.`); process.exitCode=1; } res.resume(); }).on('error', () => { process.exitCode=1; });
});
server.listen(port, '127.0.0.1', () => { console.log(`Ladder viewer: ${url}\nClose this window or press Ctrl+C to stop.`); openBrowser(); });
