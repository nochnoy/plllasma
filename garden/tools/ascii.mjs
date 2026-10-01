// Renders PNGs as coarse ASCII art so shape/color can be inspected in text form.
// Usage: node tools/ascii.mjs <dir|file> [cols]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import jpeg from 'jpeg-js';

const dir = process.argv[2] || 'extracted';
const cols = Number(process.argv[3] || 44);

function decodePng(buf) {
  let p = 8;
  let width = 0, height = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  let palette = null, trns = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString('latin1');
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 1;
  const bpp = Math.max(1, (channels * bitDepth) / 8);
  const stride = Math.ceil((width * channels * bitDepth) / 8);
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let off = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[off++];
    const line = Uint8Array.from(raw.subarray(off, off + stride)); off += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 0xff;
      else if (filter === 2) line[i] = (line[i] + b) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      if (colorType === 6) { out[di] = line[si]; out[di + 1] = line[si + 1]; out[di + 2] = line[si + 2]; out[di + 3] = line[si + 3]; }
      else if (colorType === 2) { out[di] = line[si]; out[di + 1] = line[si + 1]; out[di + 2] = line[si + 2]; out[di + 3] = 255; }
      else if (colorType === 3) { const pi = line[si] * 3; out[di] = palette[pi]; out[di + 1] = palette[pi + 1]; out[di + 2] = palette[pi + 2]; out[di + 3] = trns && line[si] < trns.length ? trns[line[si]] : 255; }
      else { out[di] = out[di + 1] = out[di + 2] = line[si]; out[di + 3] = 255; }
    }
    prev = line;
  }
  return { width, height, data: out };
}

const RAMP = ' .:-=+*#%@';
const targets = statSync(dir).isDirectory()
  ? readdirSync(dir)
      .filter((f) => /\.(png|jpe?g)$/i.test(f))
      .sort()
      .map((f) => join(dir, f))
  : [dir];
for (const target of targets) {
  const f = target.split(/[\\/]/).pop() ?? target;
  let decoded;
  const file = readFileSync(target);
  if (/\.png$/i.test(f)) decoded = decodePng(file);
  else { const j = jpeg.decode(file, { useTArray: true }); decoded = { width: j.width, height: j.height, data: j.data }; }
  const { width, height, data } = decoded;
  // palette
  const counts = new Map();
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3];
    if (a < 128) continue;
    const key = `${data[i * 4] >> 4},${data[i * 4 + 1] >> 4},${data[i * 4 + 2] >> 4}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  const pal = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => {
    const [r, g, b] = k.split(',').map(Number);
    return `#${((r << 4) | 8).toString(16).padStart(2, '0')}${((g << 4) | 8).toString(16).padStart(2, '0')}${((b << 4) | 8).toString(16).padStart(2, '0')}(${((n / total) * 100).toFixed(0)}%)`;
  }).join(' ');
  const ratio = height / width;
  const w = Math.min(cols, width);
  const h = Math.max(1, Math.round(w * ratio * 0.5));
  console.log(`\n=== ${f} (${width}x${height}) ===`);
  console.log(`palette: ${pal}`);
  for (let ry = 0; ry < h; ry++) {
    let line = '';
    for (let rx = 0; rx < w; rx++) {
      const x0 = Math.floor((rx * width) / w), x1 = Math.max(x0 + 1, Math.floor(((rx + 1) * width) / w));
      const y0 = Math.floor((ry * height) / h), y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * height) / h));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        const al = data[i + 3] / 255;
        r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
      }
      const alpha = a / n;
      if (alpha < 0.15) { line += ' '; continue; }
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / Math.max(1, a);
      const idx = Math.min(RAMP.length - 1, Math.max(1, Math.round((lum / 255) * (RAMP.length - 1))));
      line += RAMP[idx];
    }
    console.log(line);
  }
}
