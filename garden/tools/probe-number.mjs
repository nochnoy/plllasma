// Patch a double constant inside one DoAction and watch what the original does in Ruffle.
// Used to calibrate the port against the real movie: e.g. gravity 0.0011 -> 0 stops the fall,
// 0.011 makes it ten times faster, which pins down how the engine reads its own clock.
//
// Usage: node tools/probe-number.mjs <actionIndex> <oldValue> <newValue> [label]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import puppeteer from 'puppeteer';
import { analyse } from './image-stats.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outDir = join(root, 'tmp-probe');
mkdirSync(outDir, { recursive: true });

const actionIndex = Number(process.argv[2] ?? 9);
const oldValue = Number(process.argv[3] ?? 0.0011);
const newValue = Number(process.argv[4] ?? 0);
const label = process.argv[5] ?? `a${actionIndex}-${newValue}`;

/** AVM1 stores doubles as two little-endian u32 words, high word first. */
function doubleBytes(value) {
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(value, 0);
  return Buffer.from([buf[4], buf[5], buf[6], buf[7], buf[0], buf[1], buf[2], buf[3]]);
}

const raw = readFileSync(join(root, 'assets-source/free-falling-girl.swf'));
const body = raw.subarray(0, 3).toString('latin1') === 'CWS' ? inflateSync(raw.subarray(8)) : Buffer.from(raw.subarray(8));
const patched = Buffer.from(body);

function rectEnd(buf, off) {
  const nbits = buf[off] >> 3;
  return off + Math.ceil((5 + nbits * 4) / 8);
}

const needle = doubleBytes(oldValue);
const replacement = doubleBytes(newValue);
let idx = 0;
let hits = 0;
let p = rectEnd(patched, 0) + 4;
while (p < patched.length) {
  const rh = patched.readUInt16LE(p);
  p += 2;
  const code = rh >> 6;
  let len = rh & 0x3f;
  if (len === 0x3f) { len = patched.readUInt32LE(p); p += 4; }
  if (code === 12 && idx === actionIndex) {
    for (let i = 0; i + 9 <= len; i++) {
      if (patched[p + i] === 0x06 && patched.subarray(p + i + 1, p + i + 9).equals(needle)) {
        replacement.copy(patched, p + i + 1);
        hits++;
      }
    }
  }
  if (code === 12) idx++;
  p += len;
  if (code === 0) break;
}
console.log(`action[${actionIndex}]: ${oldValue} -> ${newValue}: ${hits} occurrence(s)`);

const newHeader = Buffer.from(raw.subarray(0, 8));
newHeader.writeUInt32LE(patched.length + 8, 4);
const probePath = `tmp-probe/${label}.swf`;
writeFileSync(join(root, probePath), Buffer.concat([newHeader, deflateSync(patched)]));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const file = normalize(join(root, decodeURIComponent(url)));
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 550, height: 400, deviceScaleFactor: 1 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const runs = [['orig', '/assets-source/free-falling-girl.swf'], ['probe', '/' + probePath]];
for (const [name, swf] of runs) {
  await page.goto(`http://127.0.0.1:${port}/tools/ruffle/index.html?swf=${encodeURIComponent(swf.replace(/^\/assets/, '/assets'))}`, { waitUntil: 'load' });
  await page.evaluate(() => window.__ready);
  const began = Date.now();
  let first = null;
  console.log(`\n${name}:`);
  for (const at of [50, 250, 500, 1000, 2000, 3000, 4000]) {
    const due = began + at;
    const now = Date.now();
    if (due > now) await wait(due - now);
    const file = join(outDir, `${label}-${name}-${at}.png`);
    await page.screenshot({ path: file });
    const s = analyse(file, { components: false });
    if (!s.bbox) { console.log(`  ${String(at).padStart(5)}ms  (empty)`); continue; }
    if (first === null) first = s.bbox.y1;
    console.log(
      `  ${String(at).padStart(5)}ms  y1=${String(s.bbox.y1).padStart(3)} (dy=${String(s.bbox.y1 - first).padStart(4)})  ` +
      `size=${s.bbox.w}x${s.bbox.h}  ink=${s.pixels}`,
    );
  }
}

await browser.close();
server.close();
