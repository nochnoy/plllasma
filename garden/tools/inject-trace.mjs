// Injects a small AVM1 logging function into the original movie's frame-2 script.
//
// The injected code wraps the movie's own `_root.onEnterFrame`: it calls the original handler,
// then `trace()`s the runtime state (the engine's timeFactor/speed and every particle's rig name
// and position). Ruffle prints `trace` to the browser console, so this turns the un-instrumented
// SWF into a numeric reference for the port: run both, compare the numbers.
//
// The ActionScript is emitted by hand with the tiny assembler below, because the movie has no
// trace statements of its own and there is no way to evaluate expressions from outside.
//
// Usage: node tools/inject-trace.mjs [out.swf] [--with-balls] [--everyN 5]
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';
import puppeteer from 'puppeteer';
import { decodeStream, poolOf, NAMES } from './avm1-parse.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outPath = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'tmp-probe/traced.swf';
const keepBalls = process.argv.includes('--with-balls');
const everyN = Number(process.argv[process.argv.indexOf('--everyN') + 1]) || 1;
const dumpConstraints = process.argv.includes('--constraints');
const countCalls = process.argv.includes('--count');

// ------------------------------------------------------------------ AVM1 assembler

const enc = {
  u16: (v) => [v & 0xff, (v >> 8) & 0xff],
  u32: (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff],
};

/** One PushValue (type byte + data), in the order the values are pushed. */
function pushValue(v) {
  if (typeof v === 'object' && v !== null && 'register' in v) return [0x04, v.register];
  if (typeof v === 'string') {
    const bytes = [...Buffer.from(v, 'latin1'), 0];
    return [0x00, ...bytes];
  }
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 2 ** 31) return [0x07, ...enc.u32(v >>> 0)];
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(v, 0);
    return [0x06, buf[4], buf[5], buf[6], buf[7], buf[0], buf[1], buf[2], buf[3]];
  }
  throw new Error(`unsupported push value ${v}`);
}

const OP = {
  getVariable: 0x1c,
  setVariable: 0x1d,
  trace: 0x26,
  getTime: 0x34,
  callFunction: 0x3d,
  pop: 0x17,
  add2: 0x47,
  getMember: 0x4e,
  setMember: 0x4f,
  end: 0x00,
};

class Asm {
  constructor() {
    this.bytes = [];
  }

  /** `push <values...>` — one value after another onto the stack. */
  push(...values) {
    const payload = values.flatMap(pushValue);
    this.bytes.push(0x96, ...enc.u16(payload.length), ...payload);
    return this;
  }

  op(code) {
    this.bytes.push(code);
    return this;
  }

  /** Pushes the value of a dotted path rooted at a scope variable, e.g. PEng.particles. */
  path(...names) {
    this.push(names[0]);
    this.op(OP.getVariable);
    for (const name of names.slice(1)) {
      this.push(name);
      this.op(OP.getMember);
    }
    return this;
  }

  /** Pops two values and concatenates them (numbers become strings). */
  concat() {
    return this.op(OP.add2);
  }

  /**
   * Emits `defineFunction2` (SWF 7). Note the AVM1 quirk the movie's own decoder relies on: the
   * action's declared length covers only the header up to and including the code-size field — the
   * function body itself follows outside that length, which is why every action decoder has to add
   * the body size separately. Each parameter is given a register to land in.
   */
  defineFunction2(name, body, params = []) {
    const nameBytes = [...Buffer.from(name, 'latin1'), 0];
    const header = [
      ...nameBytes,
      ...enc.u16(params.length),
      8,                    // register count
      ...enc.u16(0x01),     // preload `this` into r1, nothing else
      ...params.flatMap((p) => [p.register, ...Buffer.from(p.name, 'latin1'), 0]),
      ...enc.u16(body.length),
    ];
    this.bytes.push(0x8e, ...enc.u16(header.length), ...header, ...body);
    return this;
  }
}

/**
 * Builds a counting wrapper around one engine method: bumps a counter on the engine, then calls
 * the original method through `this`. This is how the port's assumptions about the update
 * structure (how many solver passes per frame, how often Verlet runs) are checked against the
 * real movie.
 */
function countingWrapper(method, counter, argc) {
  const me = new Asm();
  // _root.PEng[counter] = _root.PEng[counter] + 1
  me.push('_root');
  me.op(OP.getVariable);
  me.push('PEng');
  me.op(OP.getMember);
  me.push(counter);
  me.push('_root');
  me.op(OP.getVariable);
  me.push('PEng');
  me.op(OP.getMember);
  me.push(counter);
  me.op(OP.getMember);
  me.push(1);
  me.op(0x0a); // add
  me.op(OP.setMember);
  me.op(OP.pop);
  if (method === 'satisfyAngConstraint') {
    // Fingerprint the constraint that was passed in: the sum of the rest lengths solved, so the
    // trace shows whether every marker is solved or only some of them.
    for (const [target, source, squared] of [
      ['__sig', 'restLength', false],
      ['__sigSq', 'restLength', true],
    ]) {
      me.push('_root');
      me.op(OP.getVariable);
      me.push('PEng');
      me.op(OP.getMember);
      me.push(target);
      me.push('_root');
      me.op(OP.getVariable);
      me.push('PEng');
      me.op(OP.getMember);
      me.push(target);
      me.op(OP.getMember);
      me.push({ register: 3 });
      me.push(source);
      me.op(OP.getMember);
      if (squared) {
        me.push({ register: 3 });
        me.push(source);
        me.op(OP.getMember);
        me.op(0x0c); // multiply
      }
      me.op(0x0a); // add
      me.op(OP.setMember);
      me.op(OP.pop);
    }
  }
  // this.__orig_<method>(args...)  — [args..., nargs, object, method name], and `this` has to be
  // taken from the preloaded register: `getVariable('this')` would look up a property instead.
  for (let i = argc; i >= 1; i--) me.push({ register: 1 + i });
  me.push(argc);
  me.push({ register: 1 });
  me.push(`__orig_${method}`);
  me.op(0x52); // callMethod
  me.bytes.push(0x3e); // return
  return me.bytes;
}

const ENGINE_METHODS = [
  { name: 'update', argc: 1 },
  { name: 'verlet', argc: 0 },
  { name: 'hold', argc: 0 },
  { name: 'constrain', argc: 0 },
  { name: 'collision', argc: 0 },
  { name: 'satisfyAngConstraint', argc: 1 },
];

/**
 * The fields each trace row starts with, before the particle coordinates:
 * `timer | timeFactor | speed |` then the engine counters (which is how the movie's own update
 * structure was measured) and the solver fingerprints. frontend/tests/original-trace.test.ts skips
 * exactly this many fields, so the list has to stay in step with it.
 */
const TRACE_HEADER = [
  'timeFactor',
  'speed',
  ...ENGINE_METHODS.map((m) => `__count_${m.name}`),
  '__sig',
  '__sigSq',
];
const TRACE_HEADER_FIELDS = TRACE_HEADER.length + 1; // + the timer

/** Gives every counter a number, so the trace always holds a full row of fields. */
function initCounters(as, methods = ENGINE_METHODS) {
  for (const m of methods) {
    as.push('_root');
    as.op(OP.getVariable);
    as.push('PEng');
    as.op(OP.getMember);
    as.push(`__count_${m.name}`);
    as.push(0);
    as.op(OP.setMember);
    as.op(OP.pop);
  }
  for (const name of ['__sig', '__sigSq']) {
    as.push('_root');
    as.op(OP.getVariable);
    as.push('PEng');
    as.op(OP.getMember);
    as.push(name);
    as.push(0);
    as.op(OP.setMember);
    as.op(OP.pop);
  }
}

/** Installs counting wrappers for the engine methods the port has to mirror. */
function instrument(as) {
  const methods = ENGINE_METHODS;
  initCounters(as, methods);
  for (const m of methods) {
    const counter = `__count_${m.name}`;
    // PEngine2D.prototype.__orig_<m> = PEngine2D.prototype.<m>
    as.push('PEngine2D');
    as.op(OP.getVariable);
    as.push('prototype');
    as.op(OP.getMember);
    as.push(`__orig_${m.name}`);
    as.push('PEngine2D');
    as.op(OP.getVariable);
    as.push('prototype');
    as.op(OP.getMember);
    as.push(m.name);
    as.op(OP.getMember);
    as.op(OP.setMember);
    as.op(OP.pop);
    // PEngine2D.prototype.<m> = function (<arg>) { ... }
    as.push('PEngine2D');
    as.op(OP.getVariable);
    as.push('prototype');
    as.op(OP.getMember);
    as.push(m.name);
    const params = m.argc === 1 ? [{ name: '', register: 3 }] : m.argc === 2 ? [{ name: '', register: 3 }, { name: '', register: 4 }] : [];
    as.defineFunction2('', countingWrapper(m.name, counter, m.argc), params);
    as.op(OP.setMember);
    as.op(OP.pop);
  }
}
/** Lays out a `trace("field|field|...")` row, sharing the JSON-ish formatting between the
 * constraint report and the per-frame trace. */
function constraintReport(particleCount, constraintCount) {
  const me = new Asm();
  me.push('');
  const field = (emit) => {
    me.push('|');
    me.concat();
    emit();
    me.concat();
  };
  for (let i = 0; i < particleCount; i++) {
    field(() => me.path('PEng', 'particles', String(i), 'mass'));
    field(() => me.path('PEng', 'particles', String(i), 'rad'));
  }
  for (let i = 0; i < constraintCount; i++) {
    field(() => me.path('PEng', 'angledConstraints', String(i), 'restLength'));
    field(() => me.path('PEng', 'angledConstraints', String(i), 'minang'));
    field(() => me.path('PEng', 'angledConstraints', String(i), 'maxang'));
    field(() => me.path('PEng', 'angledConstraints', String(i), 'inversed'));
    // Endpoint masses identify which particle ended up as p1 / p2 / p3.
    field(() => me.path('PEng', 'angledConstraints', String(i), 'p1', 'mass'));
    field(() => me.path('PEng', 'angledConstraints', String(i), 'p2', 'mass'));
    field(() => me.path('PEng', 'angledConstraints', String(i), 'p3', 'mass'));
  }
  field(() => me.path('PEng', 'angledConstraints', 'length'));
  field(() => me.path('PEng', 'constraints', 'length'));
  field(() => me.path('PEng', 'particles', 'length'));
  return me.bytes;
}

/** The wrapper body: run the movie's own frame handler, then trace the state after it. */

/** Builds the body of the wrapper: call the movie's own handler, then trace the state. */
function wrapperBody(particleCount) {
  const me = new Asm();
  // _root.__origOnEnterFrame();  — called as a method, the layout the movie itself uses:
  // [args..., nargs, object, method name].
  me.push(0);
  me.path('_root');
  me.push('__origOnEnterFrame');
  me.op(0x52); // callMethod
  me.op(OP.pop);
  // trace("" + timer | timeFactor | speed | method call counts | name:x,y ...)
  me.push('');
  const field = (emit) => {
    me.push('|');
    me.concat();
    emit();
    me.concat();
  };
  field(() => me.op(OP.getTime));
  for (const name of TRACE_HEADER) {
    field(() => me.path('PEng', name));
  }
  for (let i = 0; i < particleCount; i++) {
    field(() => me.path('PEng', 'particles', String(i), 'x'));
    field(() => me.path('PEng', 'particles', String(i), 'y'));
  }
  me.op(OP.trace);
  me.op(OP.end);
  return me.bytes;
}

// ------------------------------------------------------------------ patch the movie

const raw = readFileSync(join(root, 'assets-source/free-falling-girl.swf'));
const body = raw.subarray(0, 3).toString('latin1') === 'CWS' ? inflateSync(raw.subarray(8)) : Buffer.from(raw.subarray(8));
const patched = Buffer.from(body);

function rectEnd(buf, off) {
  const nbits = buf[off] >> 3;
  return off + Math.ceil((5 + nbits * 4) / 8);
}

let actionIndex = 0;
let q = rectEnd(patched, 0) + 4;
while (q < patched.length) {
  const tagAt = q;
  const rh = patched.readUInt16LE(q);
  q += 2;
  const code = rh >> 6;
  let len = rh & 0x3f;
  let headerBytes = 2;
  if (len === 0x3f) { len = patched.readUInt32LE(q); q += 4; headerBytes = 6; }
  const dataAt = q;

  if (code === 12 && actionIndex === 12) {
    const payload = patched.subarray(dataAt, dataAt + len);
    if (payload[payload.length - 1] !== 0x00) throw new Error('last action does not end with `end`');

    const install = new Asm();
    // _root.__origOnEnterFrame = _root.onEnterFrame
    install.push('_root');
    install.op(OP.getVariable);
    install.push('__origOnEnterFrame');
    install.path('_root', 'onEnterFrame');
    install.op(OP.setMember);
    // _root.onEnterFrame = function () { ... }
    install.push('_root');
    install.op(OP.getVariable);
    install.push('onEnterFrame');
    install.defineFunction2('', wrapperBody(12));
    install.op(OP.setMember);
    initCounters(install);
    if (countCalls) instrument(install);
    if (dumpConstraints) {
      install.bytes.push(...constraintReport(12, 20));
    }

    const merged = Buffer.concat([
      payload.subarray(0, payload.length - 1),
      Buffer.from(install.bytes),
      Buffer.from([OP.end]),
    ]);

    // Validate with the same decoder used to read the movie, so a malformed action cannot
    // silently kill the movie's frame script.
    const check = decodeStream(merged, 0, merged.length);
    if (check.error !== null) {
      const at = check.error;
      throw new Error(
        `injected code does not decode: error at ${at} of ${merged.length} ` +
        `(bytes ${merged.subarray(Math.max(0, at - 6), at + 10).toString('hex')})`,
      );
    }
    console.log(`validated ${check.list.length} actions, pool ${poolOf(check.list).length}`);
    for (const ins of check.list) {
      if (!ins.extra.fn) continue;
      const params = (ins.extra.fn.params ?? []).map((p) => `r${p.register}`).join(',');
      const ops = (ins.extra.fn.body ?? []).map((i) => NAMES[i.op] ?? i.op.toString(16));
      console.log(
        `  fn(${params}) regs=${ins.extra.registerCount} flags=0x${(ins.extra.flags ?? 0).toString(16)} ` +
        `len=${ins.extra.fn.codeEnd - ins.extra.fn.codeStart} ops=${ops.slice(0, 14).join(',')}${ops.length > 14 ? '...' : ''}`,
      );
    }
    // Rebuild the whole body: [before the tag][tag header][merged payload][after the tag].
    const header = merged.length < 0x3f
      ? Buffer.from(enc.u16((code << 6) | merged.length))
      : Buffer.concat([Buffer.from(enc.u16((code << 6) | 0x3f)), Buffer.from(enc.u32(merged.length))]);
    const out = Buffer.concat([patched.subarray(0, tagAt), header, merged, patched.subarray(dataAt + len)]);
    console.log(`action[12] rebuilt: ${len} -> ${merged.length} bytes, tag header ${header.length}`);
    writeSwf(out);
    break;
  }
  if (code === 12) actionIndex++;
  q = dataAt + len;
  if (code === 0) break;
}

function writeSwf(bytes) {
  if (!keepBalls) {
    let hits = 0;
    let q = rectEnd(bytes, 0) + 4;
    while (q < bytes.length) {
      const rh = bytes.readUInt16LE(q);
      q += 2;
      const code = rh >> 6;
      let len = rh & 0x3f;
      if (len === 0x3f) { len = bytes.readUInt32LE(q); q += 4; }
      if (code === 12) {
        const region = bytes.subarray(q, q + len);
        for (let i = 0; i + 5 <= region.length; i++) {
          if (region.toString('latin1', i, i + 5) === 'ball\0' && (!i || region[i - 1] === 0)) {
            bytes.write('Xall', q + i, 'latin1');
            hits++;
          }
        }
      }
      q += len;
      if (code === 0) break;
    }
    console.log(`balls patched off: ${hits} reference(s)`);
  }
  const header = Buffer.from(raw.subarray(0, 8));
  header.writeUInt32LE(bytes.length + 8, 4);
  writeFileSync(join(root, outPath), Buffer.concat([header, deflateSync(bytes)]));
  console.log(`wrote ${outPath} (body ${bytes.length} bytes)`);
}

// ------------------------------------------------------------------ run it

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
const lines = [];
page.on('console', (m) => {
  const text = m.text();
  const match = /\|\s*(\d+)\|/.exec(text);
  if (!match) return;
  // The console adds its own `color: ...` styling to the message; keep only the trace itself.
  const body = text.replace(/^%c[^%]*%c[^%]*%c\s*/, '').split(' color: ')[0].trim();
  lines.push(body);
});
await page.goto(`http://127.0.0.1:${port}/tools/ruffle/index.html?swf=${encodeURIComponent('/' + outPath)}`, { waitUntil: 'load' });
await page.evaluate(() => window.__ready);
await new Promise((r) => setTimeout(r, 4000));
console.log(`trace lines captured: ${lines.length}`);
const dump = process.argv.includes("--dump");
if (dump) {
  const file = dumpConstraints ? 'frontend/tests/data/original-constraints.txt' : 'frontend/tests/data/original-trace.txt';
  writeFileSync(join(root, file), lines.join('\n') + '\n');
  console.log(`wrote ${file}`);
}
const sample = everyN > 1 ? lines.filter((_, i) => i % everyN === 0) : [...lines.slice(0, 3), '...', ...lines.slice(-3)];
for (const line of sample) console.log(line);
console.log(`trace rows start with ${TRACE_HEADER_FIELDS} header fields, then 12 particle pairs`);
await browser.close();
server.close();
