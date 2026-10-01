// Ground-truth comparison: the original SWF (with its bouncing balls patched off) rendered by
// Ruffle next to this port, screenshotted at the same moments after the movie starts.
//
// The ball linkage id is renamed in place, so `attachMovie("ball", ...)` fails and the original's
// 12 collision balls never appear — leaving exactly the doll physics the port is meant to copy.
// Both are shot with the doll drawn at the same size — 0.8 of a screen pixel per world pixel, which
// is the movie's own `_root._yscale = 80` over its 550x400 stage — so the silhouettes can be put
// beside each other. The frames are not the same size: the port plays in a 1000x740 room, so it is
// given a smaller window, one that lands on the same scale (see below).
//
// The numbers below are silhouette boxes read off the screenshots by `image-stats.mjs`, measured
// against whichever flat colour most of the picture turns out to be. In the movie the doll falls
// through empty sky, so her box is her own; in the port she falls through the hall, which covers its
// whole world, so the port's side reads the hall instead whenever the hall is the flattest thing on
// screen. The screenshots each run leaves in `outDir` are the half of this tool that always works —
// and they are what `docs/porting.md` points at when it says the original can be seen at scene scale.
//
// Requires `npm i --no-save @ruffle-rs/ruffle puppeteer` and a prior `npm run build`.
// Usage: node tools/ruffle-compare.mjs [outDir]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import puppeteer from 'puppeteer';
import { analyse } from './image-stats.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outDir = join(root, process.argv[2] ?? 'tmp-compare');
mkdirSync(outDir, { recursive: true });

const TIMES_MS = [50, 200, 400, 700, 1100, 1600, 2200, 3000, 4000];

// ------------------------------------------------------------------ patch the SWF

const raw = readFileSync(join(root, 'assets-source/free-falling-girl.swf'));
const body = raw.subarray(0, 3).toString('latin1') === 'CWS' ? inflateSync(raw.subarray(8)) : Buffer.from(raw.subarray(8));
const patched = Buffer.from(body);

function rectEnd(buf, off) {
  const nbits = buf[off] >> 3;
  return off + Math.ceil((5 + nbits * 4) / 8);
}

let hits = 0;
let p = rectEnd(patched, 0) + 4;
while (p < patched.length) {
  const rh = patched.readUInt16LE(p);
  p += 2;
  const code = rh >> 6;
  let len = rh & 0x3f;
  if (len === 0x3f) { len = patched.readUInt32LE(p); p += 4; }
  if (code === 12) {
    const region = patched.subarray(p, p + len);
    for (let i = 0; i + 4 <= region.length; i++) {
      const text = region.toString('latin1', i, i + 5);
      if ((text === 'ball\0' && (i === 0 || region[i - 1] === 0)) && !(region[i + 4] !== 0)) {
        patched.write('Xall', p + i, 'latin1');
        hits++;
      }
    }
  }
  p += len;
  if (code === 0) break;
}
console.log(`patched ${hits} "ball" linkage reference(s)`);

const newHeader = Buffer.from(raw.subarray(0, 8));
newHeader.writeUInt32LE(patched.length + 8, 4);
writeFileSync(join(outDir, 'original-noballs.swf'), Buffer.concat([newHeader, deflateSync(patched)]));

// ------------------------------------------------------------------ serve + shoot

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
  const file = normalize(join(root, decodeURIComponent(url)));
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
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
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 550, height: 400, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Screenshots at fixed offsets from "now", so both runs see the same schedule. */
async function shootSeries(prefix) {
  const began = Date.now();
  const times = [];
  for (const at of TIMES_MS) {
    const due = began + at;
    const now = Date.now();
    if (due > now) await wait(due - now);
    const file = join(outDir, `${prefix}-${String(at).padStart(4, '0')}.png`);
    await page.screenshot({ path: file });
    times.push({ at, file });
  }
  return times;
}

// 1. The original, balls patched away.
await page.goto(`http://127.0.0.1:${port}/tools/ruffle/index.html?swf=${encodeURIComponent('/tmp-compare/original-noballs.swf')}`, { waitUntil: 'load' });
await page.evaluate(() => window.__ready);
const origShots = await shootSeries('orig');
const ruffleErrors = logs.filter((l) => /error/i.test(l) && !/GPU stall|Failed to load resource/i.test(l));
console.log(`ruffle errors: ${ruffleErrors.length}`);
for (const line of ruffleErrors.slice(0, 3)) console.log('  ', line.slice(0, 160));

// 2. The port, restarted so both runs fall from the same authored pose.
//
// It is given an 860x652 window, which draws the port's own room at 0.8 of a screen pixel per world
// pixel — the movie's own scale, since it draws everything at 80% of its 550x400 stage and Ruffle shows
// that stage at 1:1. The port's world is its picture of the hall and is never magnified past one CSS
// pixel per world pixel (`MAX_WORLD_SCALE`), so the way to meet the movie's scale is to hand it a
// smaller window: the fit stops at the room's own 1000x740 less the 30 px margin the camera keeps, and
// (860-60)/1000 = (652-60)/740 = 0.8 exactly.
//
// And it is put on the movie's clock: the game starts her a fifth as fast (`INITIAL_SPEED`), and a
// comparison of two falls is only a comparison if they fall at the same speed.
logs.length = 0;
await page.setViewport({ width: 860, height: 652, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${port}/frontend/dist/index.html`, { waitUntil: 'load' });
await page.evaluate(() => new Promise((resolve) => {
  const tick = () => (window.__garden ? resolve(true) : setTimeout(tick, 10));
  tick();
}));
await page.evaluate(() => {
  window.__garden.respawn();
  window.__garden.engine.onHold = null;
  window.__garden.engine.speed = 1;
});
const portShots = await shootSeries('port');
const portErrors = logs.filter((l) => /error/i.test(l) && !/GPU stall|Failed to load resource|favicon/i.test(l));
console.log(`port errors: ${portErrors.length}`);
for (const line of portErrors.slice(0, 3)) console.log('  ', line.slice(0, 160));

// 3. Same measure for both: the centroid of the drawn silhouette, in stage pixels.
console.log('\n   t(ms)   original (x, y, size, parts)        port (x, y, size, parts)');
for (let i = 0; i < TIMES_MS.length; i++) {
  const a = analyse(origShots[i].file, { components: false });
  const b = analyse(portShots[i].file, { components: false });
  const fmt = (s) => {
    if (!s.bbox) return '      (empty)            ';
    return `${s.centroid.x.toFixed(1).padStart(7)},${s.centroid.y.toFixed(1).padStart(6)} ${String(s.bbox.w).padStart(3)}x${String(s.bbox.h).padStart(3)} px=${String(s.pixels).padStart(5)}`;
  };
  console.log(`${String(TIMES_MS[i]).padStart(7)}   ${fmt(a)}   ${fmt(b)}`);
}

console.log('\nscreenshots in', outDir);
await browser.close();
server.close();
