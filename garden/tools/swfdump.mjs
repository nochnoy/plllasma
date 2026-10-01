// Minimal SWF tag dumper + bitmap extractor.
// Usage: node tools/swfdump.mjs <file.swf> [--extract <outdir>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';

const file = process.argv[2];
const outDirIdx = process.argv.indexOf('--extract');
const outDir = outDirIdx >= 0 ? process.argv[outDirIdx + 1] : null;

const raw = readFileSync(file);
const sig = raw.subarray(0, 3).toString('latin1');
const version = raw[3];
let body;
if (sig === 'CWS') body = inflateSync(raw.subarray(8));
else if (sig === 'ZWS') body = inflateRawSync(raw.subarray(8));
else body = raw.subarray(8);
console.log(`signature=${sig} version=${version} fileSize=${raw.readUInt32LE(4)} bodySize=${body.length}`);

// --- rectangles ---
let p = 0;
function readRect(buf, off) {
  const nbits = buf[off] >> 3;
  const total = 5 + nbits * 4;
  const bytes = Math.ceil(total / 8);
  const bits = [];
  for (let i = 0; i < bytes; i++) {
    for (let b = 7; b >= 0; b--) bits.push((buf[off + i] >> b) & 1);
  }
  let idx = 5;
  const vals = [];
  for (let k = 0; k < 4; k++) {
    let v = 0;
    for (let i = 0; i < nbits; i++) v = (v << 1) | bits[idx++];
    vals.push(v);
  }
  return { off: off + bytes, xmin: vals[0], xmax: vals[1], ymin: vals[2], ymax: vals[3] };
}
const rect = readRect(body, p);
// sign-extend helper is skipped; values are in twips
console.log('stageRect(twips)', rect);

const TAG_NAMES = {
  0: 'End', 1: 'ShowFrame', 2: 'DefineShape', 4: 'PlaceObject', 5: 'RemoveObject',
  6: 'DefineBits', 7: 'DefineButton', 8: 'JPEGTables', 9: 'SetBackgroundColor',
  10: 'DefineFont', 11: 'DefineText', 12: 'DoAction', 13: 'DefineFontInfo',
  14: 'DefineSound', 15: 'StartSound', 18: 'SoundStreamHead', 19: 'SoundStreamBlock',
  20: 'DefineBitsLossless', 21: 'DefineBitsJPEG2', 22: 'DefineShape2', 24: 'Protect',
  26: 'PlaceObject2', 28: 'RemoveObject2', 32: 'DefineShape3', 33: 'DefineText2',
  34: 'DefineButton2', 35: 'DefineBitsJPEG3', 36: 'DefineBitsLossless2',
  37: 'DefineEditText', 39: 'DefineSprite', 43: 'FrameLabel', 45: 'SoundStreamHead2',
  46: 'DefineMorphShape', 48: 'DefineFont2', 56: 'ExportAssets', 59: 'DoInitAction',
  60: 'DefineVideoStream', 61: 'VideoFrame', 62: 'DefineFontInfo2', 69: 'FileAttributes',
  70: 'PlaceObject3', 73: 'DefineFontAlignZones', 75: 'DefineFont3', 76: 'SymbolClass',
  77: 'Metadata', 78: 'DefineScalingGrid', 82: 'DoABC', 83: 'DefineShape4',
  86: 'DefineSceneAndFrameLabelData',
};

const frameRate = body.readUInt16LE(rect.off) / 256;
const frameCount = body.readUInt16LE(rect.off + 2);
console.log(`frameRate=${frameRate} frameCount=${frameCount}`);

const counts = new Map();
const tags = [];
p = rect.off + 4;
while (p < body.length) {
  const rh = body.readUInt16LE(p); p += 2;
  const code = rh >> 6;
  let len = rh & 0x3f;
  if (len === 0x3f) { len = body.readUInt32LE(p); p += 4; }
  tags.push({ code, len, start: p });
  counts.set(code, (counts.get(code) || 0) + 1);
  p += len;
  if (code === 0) break;
}

console.log('\n--- tag counts ---');
for (const [code, n] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`${String(code).padStart(3)} ${(TAG_NAMES[code] || '?').padEnd(24)} x${n}`);
}

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const t of tags) {
    const data = body.subarray(t.start, t.start + t.len);
    if ([6, 20, 21, 35, 36].includes(t.code)) {
      const ext = t.code === 6 || t.code === 21 || t.code === 35 ? 'jpg' : 'raw';
      const name = join(outDir, `tag${t.code}_${n++}.${ext}`);
      writeFileSync(name, data);
      console.log('wrote', name, data.length);
    }
  }
}
