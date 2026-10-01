// Classifies a screenshot into colour buckets so the composition can be "seen" in text.
// Legend:  . sky (pale blue)   W white/grey   S warm skin/tan   Y yellow   G green
//          B blue   P purple   R red   # dark
// Usage: node tools/picture.mjs <png> [cols]
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const file = process.argv[2];
const cols = Number(process.argv[3] || 120);
const full = decodePng(readFileSync(file));
let { width, height, data } = full;
const cropIndex = process.argv.indexOf('--crop');
if (cropIndex > 0) {
  const [cx0, cy0, cx1, cy1] = (process.argv[cropIndex + 1] ?? '').split(',').map(Number);
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;
  const cropped = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const src = ((y + cy0) * full.width + (x + cx0)) * 4;
      const dst = (y * cw + x) * 4;
      cropped[dst] = full.data[src];
      cropped[dst + 1] = full.data[src + 1];
      cropped[dst + 2] = full.data[src + 2];
      cropped[dst + 3] = full.data[src + 3];
    }
  }
  data = cropped;
  width = cw;
  height = ch;
  console.log(`crop ${cx0},${cy0} -> ${cx1},${cy1}`);
}

function classify(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  let h = 0;
  if (max !== min) {
    if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
    else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
    else h = 60 * ((r - g) / (max - min) + 4);
  }
  if (h < 0) h += 360;
  if (v < 0.35) return '#';
  if (s < 0.1) return v > 0.9 ? '.' : 'W';
  if (h >= 170 && h < 260) return 'B';
  if (h >= 60 && h < 170) return 'G';
  if (h >= 42 && h < 60) return 'Y';
  if (h >= 5 && h < 42) return s > 0.22 ? 'S' : 'W';
  if (h >= 260 && h < 330) return 'P';
  return 'R';
}

const rows = Math.max(1, Math.round(cols * (height / width) * 0.5));
const counts = new Map();
for (let ry = 0; ry < rows; ry++) {
  let line = '';
  for (let rx = 0; rx < cols; rx++) {
    const x0 = Math.floor((rx * width) / cols);
    const x1 = Math.max(x0 + 1, Math.floor(((rx + 1) * width) / cols));
    const y0 = Math.floor((ry * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * height) / rows));
    const votes = new Map();
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        const c = classify(data[i], data[i + 1], data[i + 2]);
        votes.set(c, (votes.get(c) || 0) + 1);
      }
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    const ch = best[0];
    counts.set(ch, (counts.get(ch) || 0) + best[1]);
    line += ch;
  }
  console.log(line);
}
const total = [...counts.values()].reduce((a, b) => a + b, 0);
console.log(
  'share: ' +
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}=${((n / total) * 100).toFixed(1)}%`)
      .join(' '),
);
