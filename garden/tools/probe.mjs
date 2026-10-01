// Prints the RGBA colour at specific pixel coordinates of a PNG screenshot.
// Usage: node tools/probe.mjs shot.png 465,258 450,300
import { readFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const file = process.argv[2];
const { width, height, data } = decodePng(readFileSync(file));
console.log(`${file} ${width}x${height}`);
if (process.argv[3] === '--bbox') {
  const [r, g, b, tol] = (process.argv[4] ?? '').split(',').map(Number);
  const threshold = Number.isFinite(tol) ? tol : 24;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d =
        Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b);
      if (d <= threshold) continue;
      count++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  console.log(
    `  non-background pixels=${count} bbox x=[${minX},${maxX}] y=[${minY},${maxY}] size=${maxX - minX + 1}x${maxY - minY + 1} centroid=(${(sx / Math.max(1, count)).toFixed(1)},${(sy / Math.max(1, count)).toFixed(1)})`,
  );
} else if (process.argv[3] === '--scan') {
  const [x0, y0, x1, y1] = (process.argv[4] ?? '').split(',').map(Number);
  let best = { score: -1, x: 0, y: 0, px: [0, 0, 0, 0] };
  let minGreen = { value: 255, x: 0, y: 0, px: [0, 0, 0, 0] };
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const px = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      const score = px[0] + px[2] - 2 * px[1];
      if (score > best.score) best = { score, x, y, px };
      if (px[1] < minGreen.value) minGreen = { value: px[1], x, y, px };
    }
  }
  console.log(`  most magenta: (${best.x},${best.y}) rgb=${JSON.stringify(best.px)} score=${best.score}`);
  console.log(`  min green: (${minGreen.x},${minGreen.y}) rgb=${JSON.stringify(minGreen.px)}`);
} else {
  for (const arg of process.argv.slice(3)) {
    const [xs, ys] = arg.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) {
      console.log(`  ${arg}: out of bounds`);
      continue;
    }
    const i = (y * width + x) * 4;
    const hex = `#${[0, 1, 2].map((k) => data[i + k].toString(16).padStart(2, '0')).join('')}`;
    console.log(`  (${x},${y}) rgb=${hex} r=${data[i]} g=${data[i + 1]} b=${data[i + 2]} a=${data[i + 3]}`);
  }
}
