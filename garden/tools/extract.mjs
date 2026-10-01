// Extracts DefineBitsJPEG2/3 (+alpha) as PNG, and dumps ExportAssets / shape bounds.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join } from 'node:path';
import jpeg from 'jpeg-js';

const raw = readFileSync(process.argv[2]);
const outDir = process.argv[3] || 'extracted';
const body = raw.subarray(0, 3).toString('latin1') === 'CWS' ? inflateSync(raw.subarray(8)) : raw.subarray(8);

function rectEnd(buf, off) {
  const nbits = buf[off] >> 3;
  return off + Math.ceil((5 + nbits * 4) / 8);
}
function readRect(buf, off) {
  const nbits = buf[off] >> 3;
  const bytes = Math.ceil((5 + nbits * 4) / 8);
  const bits = [];
  for (let i = 0; i < bytes; i++) for (let b = 7; b >= 0; b--) bits.push((buf[off + i] >> b) & 1);
  let idx = 5;
  const v = [];
  for (let k = 0; k < 4; k++) {
    let acc = 0;
    for (let i = 0; i < nbits; i++) acc = (acc << 1) | bits[idx++];
    if (acc >= 1 << (nbits - 1)) acc -= 1 << nbits; // sign extend
    v.push(acc / 20); // twips -> px
  }
  return { off: off + bytes, xmin: v[0], xmax: v[1], ymin: v[2], ymax: v[3] };
}

// --- PNG encoder (RGBA, filter 0) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const rawRows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawRows[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(rawRows, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rawRows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// SWF JPEG3 may store "tables-only" JPEG followed by the image JPEG; merge them.
function mergeJpeg(buf) {
  const parts = [];
  let i = 0;
  while (i < buf.length - 1) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8) { parts.push(i); i += 2; } else i++;
  }
  if (parts.length <= 1) return buf;
  let out = buf.subarray(0, parts[1] - 2); // drop the tables-only EOI
  for (let k = 1; k < parts.length; k++) {
    let end = k + 1 < parts.length ? parts[k + 1] - 2 : buf.length;
    // drop trailing EOI of this part
    let e = end;
    while (e > parts[k] + 2 && !(buf[e - 2] === 0xff && buf[e - 1] === 0xd9)) e--;
    out = Buffer.concat([out, buf.subarray(parts[k] + 2, e - 2)]);
  }
  // restore a single EOI at the end
  return Buffer.concat([out, Buffer.from([0xff, 0xd9])]);
}

mkdirSync(outDir, { recursive: true });

let p = rectEnd(body, 0) + 4;
const exports_ = [];
const shapes = [];
let bitmapCount = 0;
const spriteTags = [];
const depthStack = [];

while (p < body.length) {
  const rh = body.readUInt16LE(p); p += 2;
  const code = rh >> 6;
  let len = rh & 0x3f;
  if (len === 0x3f) { len = body.readUInt32LE(p); p += 4; }
  const data = body.subarray(p, p + len);
  p += len;

  if (code === 56) { // ExportAssets
    const n = data.readUInt16LE(0);
    let o = 2;
    for (let i = 0; i < n; i++) {
      const id = data.readUInt16LE(o); o += 2;
      let end = o;
      while (data[end] !== 0) end++;
      const name = data.subarray(o, end).toString('latin1');
      o = end + 1;
      exports_.push({ id, name });
    }
  } else if (code === 2 || code === 22 || code === 32 || code === 83) {
    const id = data.readUInt16LE(0);
    const bounds = readRect(data, 2);
    shapes.push({ code, id, bounds });
  } else if (code === 21 || code === 35) {
    const id = data.readUInt16LE(0);
    let jpegData, alpha = null;
    if (code === 35) {
      const alphaOffset = data.readUInt32LE(2);
      jpegData = data.subarray(6, 6 + alphaOffset);
      alpha = inflateSync(data.subarray(6 + alphaOffset));
    } else {
      jpegData = data.subarray(2);
    }
    const decoded = jpeg.decode(mergeJpeg(jpegData), { useTArray: true, maxMemoryUsageInMB: 512 });
    const { width, height, data: px } = decoded;
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = px[i * 4];
      rgba[i * 4 + 1] = px[i * 4 + 1];
      rgba[i * 4 + 2] = px[i * 4 + 2];
      rgba[i * 4 + 3] = alpha ? alpha[i] : 255;
    }
    const file = join(outDir, `bitmap_${id}.png`);
    writeFileSync(file, encodePng(width, height, rgba));
    console.log(`bitmap ${id}: ${width}x${height} alpha=${alpha ? 'yes' : 'no'} -> ${file}`);
    bitmapCount++;
  }
  if (code === 0) break;
}
console.log('\nexports:');
for (const e of exports_.sort((a, b) => a.name.localeCompare(b.name))) console.log(`  ${e.name.padEnd(12)} id=${e.id}`);
console.log('\nshapes:');
for (const s of shapes) {
  const b = s.bounds;
  console.log(`  code=${s.code} id=${s.id} size=${(b.xmax - b.xmin).toFixed(1)}x${(b.ymax - b.ymin).toFixed(1)} x=[${b.xmin.toFixed(1)},${b.xmax.toFixed(1)}] y=[${b.ymin.toFixed(1)},${b.ymax.toFixed(1)}]`);
}
void spriteTags; void depthStack;
