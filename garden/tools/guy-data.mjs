// Extracts the `guy` sprite's display list — the ragdoll rig — from the SWF into a TS data file.
//
// Every child of `guy` is a PlaceObject2. Two kinds exist:
//   * particle dots (char 2), whose ClipActions do `this.is = "particle"; this.mass = <n>;`
//   * constraint bars (char 4), whose ClipActions set `is`, `minang`, `maxang` and `p3`
//     (p3 is a reference to a sibling clip, e.g. `_parent.head`).
// The Extractor class turns this display list into particles and constraints at runtime; the port
// needs the same input, so the display list is baked here verbatim.
//
// Usage: node tools/guy-data.mjs [swf] [out.ts]
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { decodeStream, poolOf, rectEnd } from './avm1-parse.mjs';

const swfPath = process.argv[2] ?? 'assets-source/free-falling-girl.swf';
const outPath = process.argv[3] ?? 'frontend/src/game/guy.generated.ts';

const raw = readFileSync(swfPath);
const body = raw.subarray(0, 3).toString('latin1') === 'CWS' ? inflateSync(raw.subarray(8)) : raw.subarray(8);

class Bits {
  constructor(buf, startByte) { this.buf = buf; this.pos = startByte * 8; }
  u(n) { let v = 0; for (let i = 0; i < n; i++) { const b = this.buf[this.pos >> 3]; v = (v << 1) | ((b >> (7 - (this.pos & 7))) & 1); this.pos++; } return v; }
  s(n) { const v = this.u(n); return v >= 1 << (n - 1) ? v - (1 << n) : v; }
  align() { if (this.pos & 7) this.pos = (this.pos & ~7) + 8; }
  get bytePos() { return this.pos >> 3; }
}

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

/** Evaluates the tiny subset of AVM1 used by the rig's ClipActions into a property map. */
function runClipActions(code, parentNames) {
  const { list, error } = decodeStream(code, 0, code.length);
  if (error !== null) throw new Error(`undecoded clip action bytes at ${error}`);
  const pool = poolOf(list);
  const props = {};
  const stack = [];
  const asString = (v) => (typeof v === 'string' ? v : String(v));
  for (const ins of list) {
    switch (ins.op) {
      case 0x88: break;                                    // constantPool
      case 0x96: stack.push(...ins.extra.push.map((v) => (v.type === 'pool' ? pool[v.value] : v.value))); break;
      case 0x1c: {                                         // getVariable
        const name = asString(stack.pop());
        if (name === 'this') stack.push({ self: true });
        else if (name === '_parent') stack.push({ parent: true });
        else throw new Error(`getVariable ${name}`);
        break;
      }
      case 0x4e: {                                         // getMember
        const name = asString(stack.pop());
        const obj = stack.pop();
        if (obj?.self) stack.push({ prop: name });
        else if (obj?.parent) {
          if (!parentNames.includes(name)) throw new Error(`unknown sibling ${name}`);
          stack.push({ sibling: name });
        } else throw new Error(`getMember ${name}`);
        break;
      }
      case 0x4f: {                                         // setMember
        const value = stack.pop();
        const name = asString(stack.pop());
        const obj = stack.pop();
        if (!obj?.self) throw new Error(`setMember on non-this`);
        if (value?.sibling) props[name] = value.sibling;
        else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') props[name] = value;
        else throw new Error(`setMember ${name} value`);
        break;
      }
      case 0x17: stack.pop(); break;                       // pop
      case 0x00: break;                                    // end
      default: throw new Error(`unexpected op ${ins.op.toString(16)} in clip actions`);
    }
  }
  return props;
}

const top = [];
walkTags(body, rectEnd(body, 0) + 4, body.length, top);

let guy = null;
for (const t of top) if (t.code === 39 && t.data.readUInt16LE(0) === 5) guy = t.data;
if (!guy) throw new Error('no guy sprite');

const inner = [];
walkTags(guy, 4, guy.length, inner);

/** First pass: names, so sibling references can be validated. */
const names = [];
for (const tag of inner) {
  if (tag.code !== 26 && tag.code !== 70) continue;
  const d = tag.data;
  const flags = d[0];
  let o = 1 + 2;
  if (flags & 0x02) o += 2;
  if (flags & 0x04) { const bits = new Bits(d, o); const n = bits.u(1); if (n) { const nb = bits.u(5); bits.s(nb); bits.s(nb); } const r = bits.u(1); if (r) { const nb = bits.u(5); bits.s(nb); bits.s(nb); } const nb = bits.u(5); bits.s(nb); bits.s(nb); bits.align(); o = bits.bytePos; }
  if (flags & 0x08) { const hasAlpha = d[o] & 0x80; o += 1; if (hasAlpha) o += 2; const hasMult = d[o] & 0x10; o += 1; if (hasMult) o += 2; }
  if (flags & 0x10) o += 2;
  if (flags & 0x20) { let e = o; while (d[e] !== 0) e++; names.push(d.subarray(o, e).toString('latin1')); o = e + 1; }
}

const children = [];
let depth = 0;
for (const tag of inner) {
  if (tag.code === 1) continue;
  if (tag.code !== 26 && tag.code !== 70) continue;
  const d = tag.data;
  const flags = d[0];
  depth = d.readUInt16LE(1);
  let o = 3;
  const charId = flags & 0x02 ? d.readUInt16LE(o) : null;
  if (flags & 0x02) o += 2;
  const child = { depth, char: charId, name: null, x: 0, y: 0, xscale: 100, yscale: 100, rotation: 0 };
  if (flags & 0x04) {
    const bits = new Bits(d, o);
    const m = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    if (bits.u(1)) { const nb = bits.u(5); m.a = bits.s(nb) / 65536; m.d = bits.s(nb) / 65536; }
    if (bits.u(1)) { const nb = bits.u(5); m.b = bits.s(nb) / 65536; m.c = bits.s(nb) / 65536; }
    const nb = bits.u(5);
    m.tx = bits.s(nb) / 20; m.ty = bits.s(nb) / 20;
    bits.align();
    o = bits.bytePos;
    child.x = m.tx; child.y = m.ty;
    child.xscale = 100 * Math.hypot(m.a, m.b);
    child.yscale = 100 * Math.hypot(m.c, m.d);
    child.rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  }
  if (flags & 0x08) { const hasAlpha = d[o] & 0x80; o += 1; if (hasAlpha) o += 2; const hasMult = d[o] & 0x10; o += 1; if (hasMult) o += 2; }
  if (flags & 0x10) o += 2;
  if (flags & 0x20) { let e = o; while (d[e] !== 0) e++; child.name = d.subarray(o, e).toString('latin1'); o = e + 1; }
  if (flags & 0x40) o += 2;
  if (flags & 0x80) {
    let p = o + 2 + 4;                                   // reserved + all-event flags
    while (p + 8 <= d.length) {
      const ev = d.readUInt32LE(p);
      if (ev === 0) break;
      let placed = null;
      for (const keyed of [false, true]) {
        const q0 = p + 4 + (keyed ? 1 : 0);
        if (q0 + 4 > d.length) continue;
        const size = d.readUInt32LE(q0);
        const code = d.subarray(q0 + 4, q0 + 4 + size);
        if (!size || code.length !== size) continue;
        try {
          const props = runClipActions(code, names);
          placed = { props, next: q0 + 4 + size };
          break;
        } catch { /* try the other layout */ }
      }
      if (!placed) throw new Error(`depth ${depth}: stuck in clip actions at ${p}`);
      Object.assign(child, placed.props);
      p = placed.next;
    }
  }
  children.push(child);
}

const lines = [];
lines.push('// Generated by tools/guy-data.mjs from the `guy` sprite of assets-source/free-falling-girl.swf.');
lines.push('// The ragdoll rig exactly as authored: one entry per display-list child, with the properties');
lines.push('// its ClipActions set at load time. `p3` names a sibling, as `_parent.<name>` did in Flash.');
lines.push('');
lines.push('export interface GuyChild {');
lines.push('  depth: number;');
lines.push('  char: number;');
lines.push('  name: string | null;');
lines.push('  x: number;');
lines.push('  y: number;');
lines.push('  xscale: number;');
lines.push('  yscale: number;');
lines.push('  rotation: number;');
lines.push('  is?: string;');
lines.push('  mass?: number;');
lines.push('  minang?: number;');
lines.push('  maxang?: number;');
lines.push('  inversed?: boolean;');
lines.push('  p3?: string;');
lines.push('}');
lines.push('');
lines.push('export const GUY_CHILDREN: GuyChild[] = [');
for (const c of children) {
  const parts = [
    `depth: ${c.depth}`,
    `char: ${c.char}`,
    `name: ${c.name === null ? 'null' : JSON.stringify(c.name)}`,
    `x: ${Number(c.x.toFixed(2))}`,
    `y: ${Number(c.y.toFixed(2))}`,
    `xscale: ${Number(c.xscale.toFixed(2))}`,
    `yscale: ${Number(c.yscale.toFixed(2))}`,
    `rotation: ${Number(c.rotation.toFixed(2))}`,
  ];
  if (c.is !== undefined) parts.push(`is: ${JSON.stringify(c.is)}`);
  if (c.mass !== undefined) parts.push(`mass: ${c.mass}`);
  if (c.minang !== undefined) parts.push(`minang: ${c.minang}`);
  if (c.maxang !== undefined) parts.push(`maxang: ${c.maxang}`);
  if (c.inversed !== undefined) parts.push(`inversed: ${c.inversed}`);
  if (c.p3 !== undefined) parts.push(`p3: ${JSON.stringify(c.p3)}`);
  lines.push(`  { ${parts.join(', ')} },`);
}
lines.push('];');
lines.push('');
writeFileSync(outPath, lines.join('\n'));

console.log(`wrote ${outPath}: ${children.length} children`);
console.log('\ndepth char  name        x       y       xscale  rot     kind');
for (const c of children) {
  const kind = c.is === 'particle' ? `particle mass=${c.mass}` : `${c.is} min=${c.minang} max=${c.maxang} p3=${c.p3}`;
  console.log(
    `${String(c.depth).padStart(5)} ${String(c.char).padStart(4)}  ${(c.name ?? '-').padEnd(10)} ` +
    `${String(c.x).padStart(7)} ${String(c.y).padStart(7)} ${String(c.xscale).padStart(7)} ${String(c.rotation).padStart(7)}  ${kind}`,
  );
}
