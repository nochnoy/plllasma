// Generic AVM1 string-patch probe: replaces a pool string inside one DoAction and renders both
// the original and the patched movie side by side, reporting silhouette stats for each moment.
//
// Usage: node tools/probe-patch.mjs <actionIndex> <oldString> <newString> [delayMs] [label]
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import puppeteer from 'puppeteer';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outDir = join(root, 'tmp-patch');
mkdirSync(outDir, { recursive: true });

const actionIndex = Number(process.argv[2] ?? 4);
const oldStr = process.argv[3] ?? 'particle';
const newStr = process.argv[4] ?? 'Particle';
if (oldStr.length !== newStr.length) throw new Error('strings must be the same length');
const label = process.argv[5] ?? 'probe';
if (!/^[\x20-\x7e]*$/.test(newStr)) throw new Error('replacement must be ascii');

const raw = readFileSync(join(root, 'assets-source/free-falling-girl.swf'));
const signature = raw.subarray(0, 3).toString('latin1');
const body = signature === 'CWS' ? inflateSync(raw.subarray(8)) : Buffer.from(raw.subarray(8));
const patched = Buffer.from(body);

function rectEnd(buf, off) {
  const nbits = buf[off] >> 3;
  return off + Math.ceil((5 + nbits * 4) / 8);
}

let idx = 0, hits = 0;
let p = rectEnd(patched, 0) + 4;
while (p < patched.length) {
  const rh = patched.readUInt16LE(p);
  p += 2;
  const code = rh >> 6;
  let len = rh & 0x3f;
  if (len === 0x3f) { len = patched.readUInt32LE(p); p += 4; }
  if (code === 12) {
    if (idx === actionIndex) {
      const region = patched.subarray(p, p + len);
      for (let i = 0; i + oldStr.length + 1 <= region.length; i++) {
        if (region.toString('latin1', i, i + oldStr.length + 1) === oldStr + '\0') {
          patched.write(newStr, p + i, 'latin1');
          hits++;
        }
      }
    }
    idx++;
  }
  p += len;
  if (code === 0) break;
}
console.log(`probe ${label}: action[${actionIndex}] "${oldStr}" -> "${newStr}": ${hits} occurrence(s)`);

const newHeader = Buffer.from(raw.subarray(0, 8));
newHeader.writeUInt32LE(patched.length + 8, 4);
writeFileSync(join(outDir, `${label}.swf`), Buffer.concat([newHeader, deflateSync(patched)]));
writeFileSync(join(outDir, 'original.swf'), raw);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash' };
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
await page.setViewport({ width: 600, height: 450, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, swf] of [['orig', 'tmp-patch/original.swf'], ['patch', `tmp-patch/${label}.swf`]]) {
  logs.length = 0;
  await page.goto(`http://127.0.0.1:${port}/tools/ruffle/index.html?swf=${encodeURIComponent('/' + swf)}`, { waitUntil: 'load' });
  await page.evaluate(() => window.__ready);
  for (const at of [100, 1500]) {
    await wait(at === 100 ? at : at - 100);
    await page.screenshot({ path: join(outDir, `${label}-${name}-${at}.png`), clip: { x: 0, y: 0, width: 550, height: 400 } });
  }
  const errors = logs.filter((l) => /error|exception|TypeError|undefined/i.test(l) && !/GPU stall|Failed to load resource/i.test(l));
  console.log(`${name} errors=${errors.length}`);
  for (const e of errors.slice(0, 8)) console.log('   ', e.slice(0, 200));
}

await browser.close();
server.close();
