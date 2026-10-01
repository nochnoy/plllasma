// Locates skin-toned pixels in a screenshot (used to verify that the ragdoll is drawn).
// Usage: node tools/find-skin.mjs <png> [cols]
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const file = process.argv[2];
const cols = Number(process.argv[3] || 90);
const { width, height, data } = decodePng(readFileSync(file));

const isSkin = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 70) return false;
  const s = max === 0 ? 0 : (max - min) / max;
  if (s < 0.16) return false;
  let h = 0;
  if (max !== min) {
    if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
    else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
    else h = 60 * ((r - g) / (max - min) + 4);
  }
  if (h < 0) h += 360;
  return h >= 5 && h < 48 && max / 255 > 0.32;
};

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
let count = 0;
const grid = new Map();
const rows = Math.max(1, Math.round(cols * (height / width) * 0.5));
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!isSkin(data[i], data[i + 1], data[i + 2])) continue;
    count++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const gx = Math.floor((x / width) * cols);
    const gy = Math.floor((y / height) * rows);
    const key = gy * cols + gx;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }
}
console.log(`${file}: ${width}x${height} skinPixels=${count}`);
if (count > 0) {
  console.log(`bbox x=[${minX},${maxX}] y=[${minY},${maxY}] size=${maxX - minX + 1}x${maxY - minY + 1}`);
}
const RAMP = ' .:-=+*#%@';
for (let gy = 0; gy < rows; gy++) {
  let line = '';
  for (let gx = 0; gx < cols; gx++) {
    const n = grid.get(gy * cols + gx) ?? 0;
    const perCell = (width / cols) * (height / rows);
    const ratio = Math.min(1, n / perCell);
    line += RAMP[Math.min(RAMP.length - 1, Math.round(ratio * (RAMP.length - 1)))] ?? ' ';
  }
  console.log(line);
}
