// Decodes a DefineSprite fully: every PlaceObject2/3 field in spec order, including ClipActions,
// whose ActionRecords are disassembled with the shared AVM1 parser.
//
// Usage: node tools/guy.mjs <swf> [spriteId=5] [--raw]
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { NAMES, decodeStream, poolOf, rectEnd } from './avm1-parse.mjs';

const raw = readFileSync(process.argv[2]);
const body = raw.subarray(0, 3).toString('latin1') === 'CWS' ? inflateSync(raw.subarray(8)) : raw.subarray(8);
const wantSprite = Number(process.argv[3] ?? 5);
const showRaw = process.argv.includes('--raw');

class Bits {
  constructor(buf, startByte) { this.buf = buf; this.pos = startByte * 8; }
  u(n) { let v = 0; for (let i = 0; i < n; i++) { const b = this.buf[this.pos >> 3]; v = (v << 1) | ((b >> (7 - (this.pos & 7))) & 1); this.pos++; } return v; }
  s(n) { const v = this.u(n); return v >= 1 << (n - 1) ? v - (1 << n) : v; }
  align() { if (this.pos & 7) this.pos = (this.pos & ~7) + 8; }
  get bytePos() { return this.pos >> 3; }
}
const tw = (v) => v / 20;

function readMatrix(bits) {
  const m = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  if (bits.u(1)) { const n = bits.u(5); m.a = bits.s(n) / 65536; m.d = bits.s(n) / 65536; }
  if (bits.u(1)) { const n = bits.u(5); m.b = bits.s(n) / 65536; m.c = bits.s(n) / 65536; }
  const n = bits.u(5);
  m.tx = tw(bits.s(n)); m.ty = tw(bits.s(n));
  bits.align();
  return m;
}

function toFlash(m) {
  return {
    _x: m.tx, _y: m.ty,
    _xscale: 100 * Math.hypot(m.a, m.b),
    _yscale: 100 * Math.hypot(m.c, m.d),
    _rotation: (Math.atan2(m.b, m.a) * 180) / Math.PI,
  };
}

function render(list, indent, pool) {
  for (const ins of list) {
    const name = NAMES[ins.op] ?? `op_${ins.op.toString(16)}`;
    let text = `${indent}${name}`;
    if (ins.extra.push) {
      text += ' ' + ins.extra.push.map((v) => {
        if (v.type === 'string') return JSON.stringify(v.value);
        if (v.type === 'pool') return JSON.stringify(pool[v.value] ?? `?${v.value}`);
        if (v.type === 'register') return `r${v.value}`;
        return String(v.value);
      }).join(', ');
    }
    if (ins.extra.target !== undefined) text += ` -> ${ins.extra.target}`;
    if (ins.extra.text !== undefined) text += ` ${JSON.stringify(ins.extra.text)}`;
    console.log(text);
    if (ins.extra.fn) render(ins.extra.fn.body ?? [], indent + '  ', pool);
    if (ins.extra.block) render(ins.extra.block.body ?? [], indent + '  ', pool);
  }
}

function walkTags(buf, start, end, out) {
  let p = start;
  while (p < end) {
    const rh = buf.readUInt16LE(p); p += 2;
    const code = rh >> 6;
    let len = rh & 0x3f;
    if (len === 0x3f) { len = buf.readUInt32LE(p); p += 4; }
    out.push({ code, data: buf.subarray(p, p + len), at: p });
    if (code === 0) break;
    p += len;
  }
}

const top = [];
walkTags(body, rectEnd(body, 0) + 4, body.length, top);

const EVENT = {
  0x0001: 'keyPress', 0x0002: 'mouseMove', 0x0004: 'mouseDown', 0x0008: 'mouseUp',
  0x0010: 'mouseEnter', 0x0020: 'mouseLeave', 0x0040: 'unload', 0x0080: 'enterFrame',
  0x0100: 'load', 0x0200: 'press', 0x0400: 'release', 0x0800: 'releaseOutside',
  0x1000: 'initialize', 0x2000: 'rollOver', 0x4000: 'rollOut', 0x8000: 'dragOver',
  0x10000: 'dragOut', 0x20000: 'keyUp', 0x40000: 'construct', 0x80000: 'data',
};

for (const t of top) {
  if (t.code !== 39) continue;
  const id = t.data.readUInt16LE(0);
  if (id !== wantSprite) continue;
  const frameCount = t.data.readUInt16LE(2);
  console.log(`sprite ${id}: ${frameCount} frame(s)`);
  const inner = [];
  walkTags(t.data, 4, t.data.length, inner);
  let frame = 1;
  for (const tag of inner) {
    if (tag.code === 1) { frame++; continue; }
    if (tag.code !== 26 && tag.code !== 70) { console.log(`  [${tag.code}] ${tag.data.length}b`); continue; }
    const d = tag.data;
    if (showRaw) console.log(`  RAW ${d.toString('hex')}`);
    const flags = d[0];
    let o = 1;
    const depth = d.readUInt16LE(o); o += 2;
    const charId = flags & 0x02 ? (o += 2, d.readUInt16LE(o - 2)) : null;
    let matrix = null;
    if (flags & 0x04) { const bits = new Bits(d, o); matrix = readMatrix(bits); o = bits.bytePos; }
    if (flags & 0x08) { o += 1; if (d[o - 1] & 0x80) { o += 2; if (d[o - 2] & 0x10) o += 2; } }
    if (flags & 0x10) o += 2;                                  // ratio
    let name = null;
    if (flags & 0x20) { let e = o; while (d[e] !== 0) e++; name = d.subarray(o, e).toString('latin1'); o = e + 1; }
    if (flags & 0x40) o += 2;                                  // clip depth
    const flash = matrix ? toFlash(matrix) : null;
    let line = `  f${frame} d${depth} char=${charId} name=${name ?? '-'}`;
    if (flash) line += ` _x=${flash._x.toFixed(2)} _y=${flash._y.toFixed(2)} _xscale=${flash._xscale.toFixed(2)} _yscale=${flash._yscale.toFixed(2)} _rot=${flash._rotation.toFixed(2)}`;
    if (flags & 0x80) line += ' +CLIPACTIONS';
    console.log(line);
    if (flags & 0x80) {
      // ClipActions: u16 reserved, u32 all-event-flags, then records, then a zero end flag.
      // A record is u32 event flags, an optional u8 key code, a u32 byte size and that many
      // action bytes. Whether the key code is present is ambiguous by flag value alone, so both
      // layouts are tried and the one that decodes without leftover bytes wins.
      let p = o;
      const reserved = d.readUInt16LE(p); p += 2;
      const allFlags = d.readUInt32LE(p); p += 4;
      console.log(`      clipactions reserved=${reserved} allFlags=0x${allFlags.toString(16)}`);
      while (p + 8 <= d.length) {
        const ev = d.readUInt32LE(p);
        if (ev === 0) break;
        let placed = null;
        for (const keyed of [false, true]) {
          let q = p + 4 + (keyed ? 1 : 0);
          if (q + 4 > d.length) continue;
          const size = d.readUInt32LE(q);
          q += 4;
          if (size <= 0 || q + size > d.length) continue;
          const code = d.subarray(q, q + size);
          const { list, error } = decodeStream(code, 0, code.length);
          if (error === null && list.length) { placed = { keyed, size, code, list, q }; break; }
        }
        if (!placed) { console.log(`      !! stuck at event 0x${ev.toString(16)} offset ${p}`); break; }
        const events = Object.entries(EVENT).filter(([bit]) => ev & Number(bit)).map(([, n]) => n).join('|') || `0x${ev.toString(16)}`;
        console.log(`      on(${events})${placed.keyed ? ` key=0x${d[p + 4].toString(16)}` : ''} size=${placed.size}`);
        const pool = poolOf(placed.list);
        if (pool.length) console.log(`        pool: ${JSON.stringify(pool)}`);
        render(placed.list, '        ', pool);
        p = placed.q + placed.size;
      }
      o = p;
    }
  }
}
