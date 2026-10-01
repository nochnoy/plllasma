// Recursive SWF tag dumper: walks the whole body, descending into DefineSprite.
// Usage: node tools/tags.mjs assets-source/free-falling-girl.swf [--body] [--sprite N]
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const raw = readFileSync(process.argv[2]);
const dumpBody = process.argv.includes('--body');
const spriteIdx = process.argv.indexOf('--sprite');
const onlySprite = spriteIdx > 0 ? Number(process.argv[spriteIdx + 1]) : null;

const sig = raw.subarray(0, 3).toString('latin1');
const version = raw[3];
const fileSize = raw.readUInt32LE(4);
const body = sig === 'CWS' ? inflateSync(raw.subarray(8, fileSize)) : raw.subarray(8, fileSize);

function rectEnd(buf, off) {
  const nbits = buf[off] >> 3;
  return off + Math.ceil((5 + nbits * 4) / 8);
}

const q = rectEnd(body, 0);
const frameRate = body.readUInt16LE(q) / 256;
const frameCount = body.readUInt16LE(q + 2);

const NAME = {
  0: 'End', 1: 'ShowFrame', 2: 'DefineShape', 4: 'PlaceObject', 5: 'RemoveObject',
  6: 'DefineBits', 7: 'DefineButton', 9: 'SetBackgroundColor', 10: 'DefineFont',
  12: 'DoAction', 20: 'DefineBitsLossless', 21: 'DefineBitsJPEG2', 22: 'DefineShape2',
  24: 'Protect', 26: 'PlaceObject2', 28: 'RemoveObject2', 32: 'DefineShape3',
  33: 'DefineText2', 34: 'DefineButton2', 35: 'DefineBitsJPEG3', 36: 'DefineBitsLossless2',
  37: 'DefineEditText', 39: 'DefineSprite', 43: 'FrameLabel', 45: 'SoundStreamHead2',
  46: 'DefineMorphShape', 48: 'DefineFont2', 56: 'ExportAssets',
  57: 'ImportAssets', 58: 'EnableDebugger', 59: 'DoInitAction', 60: 'DefineVideoStream',
  61: 'VideoFrame', 62: 'DefineFontInfo2', 65: 'ScriptLimits', 66: 'SetTabIndex',
  69: 'FileAttributes', 70: 'PlaceObject3', 76: 'SymbolClass', 77: 'Metadata',
  82: 'DoABC', 86: 'DefineSceneAndFrameLabelData',
};

function walk(buf, start, end, depth, label) {
  let q = start;
  const frames = [];
  let frame = [];
  const indent = '  '.repeat(depth);
  frames.push(frame);
  while (q < end) {
    const rec = buf.readUInt16LE(q);
    q += 2;
    const type = rec >> 6;
    let len = rec & 0x3f;
    if (len === 0x3f) {
      len = buf.readUInt32LE(q);
      q += 4;
    }
    const dataStart = q;
    const tagName = NAME[type] ?? `tag_${type}`;
    let extra = '';
    if (type === 39) {
      const id = buf.readUInt16LE(q);
      const fc = buf.readUInt16LE(q + 2);
      extra = ` id=${id} frames=${fc}`;
    } else if (type === 12) {
      extra = ` len=${len}`;
    } else if (type === 26 || type === 70) {
      const flags = buf[q];
      let p = q + 1;
      let id = null, depthV = null, nameStr = null;
      if (flags & 0x02) { depthV = buf.readUInt16LE(p); p += 2; }
      if (flags & 0x01) { id = buf.readUInt16LE(p); p += 2; }
      if (flags & 0x04) { const mlen = buf[p]; nameStr = buf.subarray(p + 1, p + 1 + mlen).toString('latin1'); }
      extra = ` flags=0x${flags.toString(16)} char=${id} depth=${depthV} name=${JSON.stringify(nameStr)}`;
    } else if (type === 56) {
      const n = buf.readUInt16LE(q);
      const names = [];
      let p = q + 2;
      for (let k = 0; k < n; k++) {
        const l = buf[p];
        names.push(`${buf.subarray(p + 1, p + 1 + l).toString('latin1')}=${buf.readUInt16LE(p + 1 + l)}`);
        p += 1 + l + 2;
      }
      extra = ` ${names.join(' ')}`;
    }
    frame.push(`${indent}${tagName}@${dataStart}${extra}`);
    if (type === 39) {
      const id = buf.readUInt16LE(q);
      if (onlySprite === null || onlySprite === id) walk(buf, dataStart + 4, dataStart + len, depth + 1, `sprite${id}`);
    } else if (type === 1) {
      frame = [];
      frames.push(frame);
    }
    q = dataStart + len;
    if (type === 0) break;
  }
  if (onlySprite === null ? depth === 0 : depth === 1) {
    frames.forEach((f, i) => {
      if (!f.length) return;
      console.log(`${indent}== frame ${i} ==`);
      for (const l of f) console.log(l);
    });
  }
}

console.log(`swf v${version} ${frameCount} frames @ ${frameRate} fps`);
walk(body, q + 4, body.length, 0, 'main');
