// Runs the original SWF in Ruffle (a WebAssembly Flash player) inside headless Chromium and
// writes screenshots, so the remake can be compared against real ground truth instead of
// guesses. Requires `npm i --no-save @ruffle-rs/ruffle puppeteer`.
//
// Usage: node tools/ruffle-shot.mjs [outDir] [burst|drag]
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outDir = process.argv[2] ?? join(root, 'tmp-ruffle');
const mode = process.argv[3] ?? 'burst';
mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.swf': 'application/x-shockwave-flash',
  '.json': 'application/json',
};

const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const rel = url === '/' ? '/tools/ruffle/index.html' : decodeURIComponent(url);
  const file = normalize(join(root, rel));
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found: ' + rel);
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
  });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1700, height: 1250, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`));
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const box = { x: 0, y: 0, width: 1650, height: 1200 };

async function shot(name, region) {
  await page.screenshot({ path: join(outDir, name), ...(region ? { clip: region } : {}) });
}

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
const loaded = await page.evaluate(() => window.__ready);
console.log('ruffle load:', loaded);

if (mode === 'burst') {
  // The first moments of the movie: the authored T-pose before the physics pulls her apart.
  const frames = [0, 60, 120, 200, 300, 450, 650, 900, 1200, 1600, 2100, 2700, 3400];
  const began = Date.now();
  for (const at of frames) {
    const due = began + at;
    const now = Date.now();
    if (due > now) await wait(due - now);
    await shot(`f${String(at).padStart(4, '0')}ms.png`, box);
  }
} else {
  await wait(2500);
  await shot('drag-00.png', box);
  // Press the pointer where she is and walk it, watching how she follows.
  const path = [
    { t: 0.0, x: 0.42, y: 0.45 },
    { t: 1.0, x: 0.62, y: 0.3 },
    { t: 2.2, x: 0.32, y: 0.55 },
    { t: 3.2, x: 0.5, y: 0.8 },
  ];
  await page.mouse.move(box.width * path[0].x, box.height * path[0].y);
  await page.mouse.down();
  const began = Date.now();
  let frame = 1;
  while (Date.now() - began < path[path.length - 1].t * 1000) {
    const elapsed = (Date.now() - began) / 1000;
    let i = 0;
    while (i < path.length - 2 && path[i + 1].t < elapsed) i++;
    const from = path[i];
    const to = path[i + 1];
    const k = Math.max(0, Math.min(1, (elapsed - from.t) / (to.t - from.t)));
    await page.mouse.move(box.width * (from.x + (to.x - from.x) * k), box.height * (from.y + (to.y - from.y) * k));
    await wait(60);
    if (frame % 8 === 0) await shot(`drag-${String(frame).padStart(2, '0')}.png`, box);
    frame++;
  }
  await page.mouse.up();
  for (let i = 0; i < 6; i++) {
    await wait(300);
    await shot(`drag-release-${i}.png`, box);
  }
}

writeFileSync(join(outDir, 'console.log'), logs.filter((l) => !l.includes('GPU stall')).join('\n'));
console.log('page log:', logs.length ? '\n' + logs.filter((l) => !l.includes('GPU stall')).join('\n') : '(empty)');
console.log('screenshots in', outDir);

await browser.close();
server.close();
