// Shared AVM1 parsing: action extraction, opcode decoding, pool handling.
//
// Two format details are easy to get wrong and both matter:
//   * every opcode >= 0x80 is followed by a u16 action length, and only then its operands;
//   * `If` is 0x9D and `Call` is 0x9E — 0x9C does not exist.
// Doubles are stored as two little-endian 32-bit words, high word first.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export const NAMES = {
  0x00: 'end', 0x04: 'nextFrame', 0x05: 'prevFrame', 0x06: 'play', 0x07: 'stop',
  0x08: 'toggleQuality', 0x09: 'stopSounds', 0x0a: 'add', 0x0b: 'subtract', 0x0c: 'multiply',
  0x0d: 'divide', 0x0e: 'equals', 0x0f: 'less', 0x10: 'and', 0x11: 'or', 0x12: 'not',
  0x13: 'stringEquals', 0x14: 'stringLength', 0x15: 'stringExtract', 0x17: 'pop', 0x18: 'toInteger',
  0x1c: 'getVariable', 0x1d: 'setVariable', 0x20: 'setTarget2', 0x21: 'stringAdd',
  0x22: 'getProperty', 0x23: 'setProperty', 0x24: 'cloneSprite', 0x25: 'removeSprite', 0x26: 'trace',
  0x27: 'startDrag', 0x28: 'endDrag', 0x29: 'stringLess', 0x2a: 'throw', 0x2b: 'castOp',
  0x2c: 'implementsOp', 0x30: 'randomNumber', 0x31: 'mbStringLength', 0x32: 'charToAscii',
  0x33: 'asciiToChar', 0x34: 'getTime', 0x35: 'mbStringExtract', 0x36: 'mbCharToAscii',
  0x37: 'mbAsciiToChar', 0x3a: 'delete', 0x3b: 'delete2', 0x3c: 'defineLocal',
  0x3d: 'callFunction', 0x3e: 'return', 0x3f: 'modulo', 0x40: 'newObject', 0x41: 'defineLocal2',
  0x42: 'initArray', 0x43: 'initObject', 0x44: 'typeof', 0x45: 'targetPath', 0x46: 'enumerate',
  0x47: 'add2', 0x48: 'less2', 0x49: 'equals2', 0x4a: 'toNumber', 0x4b: 'toString',
  0x4c: 'pushDuplicate', 0x4d: 'stackSwap', 0x4e: 'getMember', 0x4f: 'setMember', 0x50: 'increment',
  0x51: 'decrement', 0x52: 'callMethod', 0x53: 'newMethod', 0x54: 'instanceOf', 0x55: 'enumerate2',
  0x60: 'bitAnd', 0x61: 'bitOr', 0x62: 'bitXor', 0x63: 'bitLShift', 0x64: 'bitRShift',
  0x65: 'bitURShift', 0x66: 'strictEquals', 0x67: 'greater', 0x68: 'stringGreater', 0x69: 'extends',
  0x81: 'gotoFrame', 0x83: 'getURL', 0x87: 'storeRegister', 0x88: 'constantPool',
  0x8a: 'waitForFrame', 0x8b: 'setTarget', 0x8c: 'gotoLabel', 0x8d: 'waitForFrame2',
  0x8e: 'defineFunction2', 0x8f: 'try', 0x94: 'with', 0x96: 'push', 0x99: 'jump',
  0x9a: 'getURL2', 0x9b: 'defineFunction', 0x9d: 'if', 0x9e: 'call', 0x9f: 'gotoFrame2',
};

export function rectEnd(buf, off) {
  const nbits = buf[off] >> 3;
  return off + Math.ceil((5 + nbits * 4) / 8);
}

/** Reads the SWF and returns every DoAction payload, in file order. */
export function readActions(file) {
  const raw = readFileSync(file);
  const sig = raw.subarray(0, 3).toString('latin1');
  const body = sig === 'CWS' ? inflateSync(raw.subarray(8)) : raw.subarray(8);
  const actions = [];
  let p = rectEnd(body, 0) + 4;
  while (p < body.length) {
    const rh = body.readUInt16LE(p);
    p += 2;
    const code = rh >> 6;
    let len = rh & 0x3f;
    if (len === 0x3f) {
      len = body.readUInt32LE(p);
      p += 4;
    }
    if (code === 12) actions.push({ offset: p, data: body.subarray(p, p + len) });
    p += len;
    if (code === 0) break;
  }
  return actions;
}

export function readString(d, o) {
  let e = o;
  while (e < d.length && d[e] !== 0) e++;
  if (e >= d.length) return null;
  return { value: d.subarray(o, e).toString('latin1'), end: e + 1 };
}

export function readDouble(buf, o) {
  return Buffer.from([buf[o + 4], buf[o + 5], buf[o + 6], buf[o + 7], buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]).readDoubleLE(0);
}

export function decodePush(payload) {
  const values = [];
  let i = 0;
  while (i < payload.length) {
    const t = payload[i++];
    if (t === 0) {
      let e = i;
      while (e < payload.length && payload[e] !== 0) e++;
      values.push({ type: 'string', value: payload.subarray(i, e).toString('latin1') });
      i = e + 1;
    } else if (t === 1) {
      values.push({ type: 'float', value: payload.readFloatLE(i) });
      i += 4;
    } else if (t === 2) values.push({ type: 'null' });
    else if (t === 3) values.push({ type: 'undefined' });
    else if (t === 4) {
      values.push({ type: 'register', value: payload[i] });
      i += 1;
    } else if (t === 5) {
      values.push({ type: 'boolean', value: payload[i] !== 0 });
      i += 1;
    } else if (t === 6) {
      values.push({ type: 'double', value: readDouble(payload, i) });
      i += 8;
    } else if (t === 7) {
      values.push({ type: 'int', value: payload.readInt32LE(i) });
      i += 4;
    } else if (t === 8) {
      values.push({ type: 'pool', value: payload[i] });
      i += 1;
    } else if (t === 9) {
      values.push({ type: 'pool', value: payload.readUInt16LE(i) });
      i += 2;
    } else return null;
  }
  return i === payload.length ? values : null;
}

/** Decodes one action at `o`. Block opcodes carry their sub-code after the body. */
export function decode(d, o) {
  const op = d[o];
  if (op === undefined) return null;
  if (op < 0x80) return { op, at: o, end: o + 1, extra: {} };
  if (o + 3 > d.length) return null;
  const length = d.readUInt16LE(o + 1);
  const bodyStart = o + 3;
  const bodyEnd = bodyStart + length;
  if (bodyEnd > d.length) return null;
  let q = bodyStart;
  let subBytes = 0;
  const extra = {};
  switch (op) {
    case 0x88: {
      const count = d.readUInt16LE(q);
      q += 2;
      const strings = [];
      for (let k = 0; k < count; k++) {
        const s = readString(d, q);
        if (!s) return null;
        strings.push(s.value);
        q = s.end;
      }
      extra.pool = strings;
      break;
    }
    case 0x96: {
      const values = decodePush(d.subarray(q, bodyEnd));
      if (!values) return null;
      extra.push = values;
      q = bodyEnd;
      break;
    }
    case 0x83: {
      const a = readString(d, q);
      if (!a) return null;
      const b = readString(d, a.end);
      if (!b) return null;
      extra.urls = [a.value, b.value];
      q = b.end;
      break;
    }
    case 0x8b:
    case 0x8c: {
      const s = readString(d, q);
      if (!s) return null;
      extra.text = s.value;
      q = s.end;
      break;
    }
    case 0x87:
    case 0x9e:
    case 0x8d:
    case 0x9f: {
      extra.byte = d[q];
      q += 1;
      break;
    }
    case 0x81: {
      extra.frame = d.readUInt16LE(q);
      q += 2;
      break;
    }
    case 0x8a: {
      extra.frame = d.readUInt16LE(q);
      extra.skip = d[q + 2];
      q += 3;
      break;
    }
    case 0x99:
    case 0x9d: {
      extra.target = q + 2 + d.readInt16LE(q);
      q += 2;
      break;
    }
    case 0x94: {
      const sub = d.readUInt16LE(q);
      q += 2;
      extra.block = { start: q, end: q + sub };
      q += sub;
      subBytes += sub;
      break;
    }
    case 0x8f: {
      const flags = d[q];
      const trySize = d.readUInt16LE(q + 1);
      const catchSize = d.readUInt16LE(q + 3);
      const finallySize = d.readUInt16LE(q + 5);
      q += 7;
      let catchVar = null;
      if (flags & 0x04) {
        catchVar = { register: d[q] };
        q += 1;
      } else {
        const s = readString(d, q);
        if (!s) return null;
        catchVar = { name: s.value };
        q = s.end;
      }
      extra.try = {
        flags,
        catchVar,
        blocks: [
          { label: 'try', start: q, end: q + trySize },
          { label: 'catch', start: q + trySize, end: q + trySize + catchSize },
          { label: 'finally', start: q + trySize + catchSize, end: q + trySize + catchSize + finallySize },
        ],
      };
      q += trySize + catchSize + finallySize;
      subBytes += trySize + catchSize + finallySize;
      break;
    }
    case 0x8e:
    case 0x9b: {
      const name = readString(d, q);
      if (!name) return null;
      q = name.end;
      const nParams = d.readUInt16LE(q);
      q += 2;
      const params = [];
      if (op === 0x8e) {
        extra.registerCount = d[q];
        q += 1;
        extra.flags = d.readUInt16LE(q);
        q += 2;
        for (let k = 0; k < nParams; k++) {
          const register = d[q];
          q += 1;
          const s = readString(d, q);
          if (!s) return null;
          params.push({ name: s.value, register });
          q = s.end;
        }
      } else {
        for (let k = 0; k < nParams; k++) {
          const s = readString(d, q);
          if (!s) return null;
          params.push({ name: s.value, register: null });
          q = s.end;
        }
      }
      const codeSize = d.readUInt16LE(q);
      q += 2;
      extra.fn = { name: name.value, params, codeStart: q, codeEnd: q + codeSize };
      q += codeSize;
      subBytes += codeSize;
      break;
    }
    default:
      break;
  }
  if (q !== bodyEnd + subBytes) return null;
  return { op, at: o, end: q, extra };
}

/** Decodes a range into a flat instruction list (function bodies nested under `extra.fn.body`). */
export function decodeStream(d, start, end, depth = 0) {
  const out = [];
  let q = start;
  let guard = 0;
  while (q < end && guard++ < 200000) {
    const ins = decode(d, q);
    if (!ins || ins.end > end) return { list: out, error: q };
    if (ins.extra.fn && depth < 8) {
      const inner = decodeStream(d, ins.extra.fn.codeStart, ins.extra.fn.codeEnd, depth + 1);
      ins.extra.fn.body = inner.list;
      ins.extra.fn.error = inner.error;
    }
    if (ins.extra.block && depth < 8) {
      ins.extra.block.body = decodeStream(d, ins.extra.block.start, ins.extra.block.end, depth + 1).list;
    }
    if (ins.extra.try && depth < 8) {
      for (const b of ins.extra.try.blocks) b.body = decodeStream(d, b.start, b.end, depth + 1).list;
    }
    out.push(ins);
    q = ins.end;
  }
  return { list: out, error: q === end ? null : q };
}

/** Every constant-pool string in the action (from its ConstantPool instruction). */
export function poolOf(list) {
  return list.find((i) => i.extra.pool)?.extra.pool ?? [];
}
