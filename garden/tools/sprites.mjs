// Dumps DefineSprite contents: placed character ids, transform matrices, names.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const raw = readFileSync(process.argv[2]);
const body = raw.subarray(0, 3).toString('latin1') === 'CWS' ? inflateSync(raw.subarray(8)) : raw.subarray(8);
function rectEnd(buf, off) { const nbits = buf[off] >> 3; return off + Math.ceil((5 + nbits * 4) / 8); }

class Bits {
  constructor(buf, start) { this.buf = buf; this.pos = start * 8; }
  u(n) { let v = 0; for (let i = 0; i < n; i++) { const byte = this.buf[this.pos >> 3]; v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1); this.pos++; } return v; }
  s(n) { const v = this.u(n); return v >= 1 << (n - 1) ? v - (1 << n) : v; }
  alignByte() { if (this.pos & 7) this.pos = (this.pos & ~7) + 8; }
}
const px = (tw) => tw / 20;

function readMatrix(bits) {
  const m = { scaleX: 1, scaleY: 1, rot0: 0, rot1: 0, tx: 0, ty: 0 };
  if (bits.u(1)) { const n = bits.u(5); m.scaleX = bits.s(n) / 65536; m.scaleY = bits.s(n) / 65536; }
  if (bits.u(1)) { const n = bits.u(5); m.rot0 = bits.s(n) / 65536; m.rot1 = bits.s(n) / 65536; }
  const n = bits.u(5);
  m.tx = px(bits.s(n)); m.ty = px(bits.s(n));
  return m;
}

function shapeFills(data) {
  const bits = new Bits(data, 0);
  bits.u(16); // shape id
  const nbits = bits.u(5);
  for (let k = 0; k < 4; k++) bits.s(nbits);
  const refs = [];
  const seen = new Set();
  const scan = (from) => {
    // brute-force scan for bitmap fill style markers 0x41/0x42/0x43 in shape records
  };
  void scan;
  return refs;
}

const sprites = new Map();   // id -> tags array
const shapes = new Map();    // id -> {bounds, fillRefs}
const shapesRaw = new Map();
const exports_ = new Map();  // id -> name
const bitmapIds = new Set();
const misc = new Map();

function walkTags(buf, start, end, out) {
  let p = start;
  while (p < end) {
    const rh = buf.readUInt16LE(p); p += 2;
    const code = rh >> 6;
    let len = rh & 0x3f;
    if (len === 0x3f) { len = buf.readUInt32LE(p); p += 4; }
    out.push({ code, data: buf.subarray(p, p + len) });
    if (code === 0) break;
    p += len;
  }
}

function readShapeBounds(data) {
  function rectAt(buf, off) {
    const nbits = buf[off] >> 3;
    const bytes = Math.ceil((5 + nbits * 4) / 8);
    const bits = new Bits(buf, off);
    bits.u(5);
    const v = [bits.s(nbits), bits.s(nbits), bits.s(nbits), bits.s(nbits)];
    void bytes;
    return v.map(px);
  }
  const id = data.readUInt16LE(0);
  const b = rectAt(data, 2);
  return { id, bounds: b };
}

const topTags = [];
walkTags(body, rectEnd(body, 0) + 4, body.length, topTags);

for (const t of topTags) {
  const d = t.data;
  if (t.code === 56) {
    const n = d.readUInt16LE(0);
    let o = 2;
    for (let i = 0; i < n; i++) {
      const id = d.readUInt16LE(o); o += 2;
      let e = o; while (d[e] !== 0) e++;
      exports_.set(id, d.subarray(o, e).toString('latin1'));
      o = e + 1;
    }
  } else if (t.code === 39) {
    const id = d.readUInt16LE(0);
    const inner = [];
    walkTags(d, 4, d.length, inner);
    sprites.set(id, inner);
  } else if ([2, 22, 32, 83].includes(t.code)) {
    shapes.set(d.readUInt16LE(0), readShapeBounds(d));
    shapesRaw.set(d.readUInt16LE(0), d);
  } else if ([6, 21, 35, 20, 36].includes(t.code)) {
    bitmapIds.add(d.readUInt16LE(0));
  }
}

// find bitmap fill references inside shape records: byte pattern 0x41/0x42/0x43 followed by u16 charId
for (const [id, d] of shapesRaw) {
  const refs = new Set();
  for (let i = 0; i + 3 < d.length; i++) {
    if ((d[i] === 0x41 || d[i] === 0x42 || d[i] === 0x43) && bitmapIds.has(d.readUInt16LE(i + 1))) refs.add(d.readUInt16LE(i + 1));
  }
  shapes.get(id).bitmaps = [...refs];
}

console.log('=== shapes ===');
for (const [id, s] of [...shapes].sort((a, b) => a[0] - b[0])) {
  const [x0, x1, y0, y1] = s.bounds;
  console.log(`shape ${id}: ${(x1 - x0).toFixed(1)}x${(y1 - y0).toFixed(1)} x=[${x0.toFixed(1)},${x1.toFixed(1)}] y=[${y0.toFixed(1)},${y1.toFixed(1)}] bitmaps=[${s.bitmaps.join(',')}]`);
}

console.log('\n=== sprites ===');
for (const [id, tags] of [...sprites].sort((a, b) => a[0] - b[0])) {
  console.log(`sprite ${id} (${exports_.get(id) || '?'}):`);
  for (const t of tags) {
    if (t.code === 26 || t.code === 70) {
      const d = t.data;
      const hasName = (d[0] & 0x20) !== 0;
      const flags = d[0];
      let o = 3; // depth(2) + flags(1)
      const cid = flags & 0x02 ? d.readUInt16LE(o) : null;
      if (flags & 0x02) o += 2;
      const bits = new Bits(d, o);
      const m = readMatrix(bits);
      let name = null;
      if (hasName) { bits.alignByte(); let p = bits.pos >> 3; let e = p; while (d[e] !== 0) e++; name = d.subarray(p, e).toString('latin1'); }
      console.log(`   place char=${cid} name=${name} pos=(${m.tx.toFixed(1)},${m.ty.toFixed(1)}) scale=(${m.scaleX.toFixed(3)},${m.scaleY.toFixed(3)}) rot=(${m.rot0.toFixed(3)},${m.rot1.toFixed(3)})`);
    } else if (t.code === 12) {
      console.log(`   DoAction ${t.data.length}b`);
    } else if (t.code === 1) {
      console.log('   ShowFrame');
    }
  }
}

console.log('\n=== exports ===');
for (const [id, name] of [...exports_].sort((a, b) => a[1].localeCompare(b[1]))) console.log(`  ${name} -> ${id}`);
void shapeFills;
