// Verifies the baked girl textures in Chromium:
//   1. Node and Chromium decode the PNGs identically.
//   2. An isolated PixiJS sprite draws them with the expected colours.
// Requires puppeteer and a prior `npm run build`.
// Usage: node tools/check-textures.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer';
import { decodePng } from './png.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'frontend', 'dist');
const files = ['head', 'chest', 'stomach', 'thigh', 'leg', 'arm', 'hand'];

const TEST_PAGE = `<!doctype html>
<html><body style="margin:0">
<div id="host" style="width:240px;height:240px"></div>
<script type="module">
import { Application, Assets, Sprite, Texture } from '/pixi.mjs';
const app = new Application();
await app.init({
  background: 0xd6e9f6,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  resizeTo: document.getElementById('host'),
  preference: 'webgl',
});
document.body.appendChild(app.canvas);
const texture = await Assets.load('/assets/characters/elena/parts/head.png');
const plain = new Sprite(texture);
plain.anchor.set(0.5);
plain.position.set(60, 60);
plain.scale.set(0.5);
const tinted = new Sprite(texture);
tinted.anchor.set(0.5);
tinted.position.set(180, 60);
tinted.scale.set(0.5);
tinted.tint = 0xff00ff;
const canvas = document.createElement('canvas');
canvas.width = 128;
canvas.height = 128;
const c2d = canvas.getContext('2d');
c2d.fillStyle = '#cc8844';
c2d.fillRect(0, 0, 128, 128);
const fromCanvas = new Sprite(Texture.from(canvas));
fromCanvas.anchor.set(0.5);
fromCanvas.position.set(60, 180);
fromCanvas.scale.set(0.5);
const scaled = new Sprite(texture);
scaled.anchor.set(0.5);
scaled.position.set(180, 180);
scaled.scale.set(0.5);
app.stage.addChild(plain, tinted, fromCanvas, scaled);
app.renderer.render(app.stage);
const readback = document.createElement('canvas');
readback.width = 240;
readback.height = 240;
const ctx = readback.getContext('2d', { willReadFrequently: true });
ctx.drawImage(app.canvas, 0, 0);
window.__probe = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
window.__meta = {
  texW: texture.width,
  texH: texture.height,
  src: texture.source.resource?.src ?? String(texture.source.resource),
  alphaMode: texture.source.alphaMode,
  plainW: plain.width,
  resolution: app.renderer.resolution,
  canvasW: app.canvas.width,
  cssW: app.canvas.clientWidth,
};
window.__ready = true;
</script>
</body></html>`;

const PIXI_PATH = join(root, 'frontend', 'node_modules', 'pixi.js', 'dist', 'pixi.mjs');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (url === '/pixi-test.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(TEST_PAGE);
    return;
  }
  if (url === '/pixi.mjs') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(readFileSync(PIXI_PATH));
    return;
  }
  let file = join(dist, url === '/' ? 'index.html' : decodeURIComponent(url));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('console', (message) => console.log('  [page]', message.text()));
page.on('pageerror', (error) => console.log('  [pageerror]', error.message));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

console.log('--- decode comparison (Node vs Chromium) ---');
for (const name of files) {
  const nodePng = decodePng(readFileSync(join(dist, 'assets', 'characters', 'elena', 'parts', `${name}.png`)));
  const points = [
    [Math.floor(nodePng.width / 2), Math.floor(nodePng.height / 2)],
    [Math.floor(nodePng.width * 0.4), Math.floor(nodePng.height * 0.45)],
  ];
  const sampled = await page.evaluate(
    async (file, pts) => {
      const img = new Image();
      img.src = `./assets/characters/elena/parts/${file}.png`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return pts.map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data));
    },
    name,
    points,
  );
  const nodeValues = points.map(([x, y]) => {
    const i = (y * nodePng.width + x) * 4;
    return [nodePng.data[i], nodePng.data[i + 1], nodePng.data[i + 2], nodePng.data[i + 3]];
  });
  console.log(
    `${name.padEnd(8)} ${nodePng.width}x${nodePng.height} match=${JSON.stringify(nodeValues) === JSON.stringify(sampled)} node=${JSON.stringify(nodeValues[0])} chrome=${JSON.stringify(sampled[0])}`,
  );
}

console.log('--- isolated PixiJS render of head.png ---');
await page.goto(`http://127.0.0.1:${port}/pixi-test.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 15000 });
const meta = await page.evaluate(() => window.__meta);
console.log('meta', meta);
const probes = await page.evaluate(() => ({
  plain: window.__probe(60, 60),
  tinted: window.__probe(180, 60),
  fromCanvas: window.__probe(60, 180),
  scaledHalf: window.__probe(180, 180),
  outside: window.__probe(230, 230),
}));
console.log('pixi probes', JSON.stringify(probes));
const headPng = decodePng(readFileSync(join(dist, 'assets', 'girl', 'head.png')));
const at = (x, y) => {
  const i = (y * headPng.width + x) * 4;
  return [headPng.data[i], headPng.data[i + 1], headPng.data[i + 2], headPng.data[i + 3]];
};
console.log('expected head centre from PNG:', JSON.stringify(at(67, 63)), '(sprite scale 0.5 -> screen centre)');

await browser.close();
server.close();
