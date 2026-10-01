// Reports the alpha distribution of PNG textures (useful for spotting eroded or faded art).
// Usage: node tools/alpha-stats.mjs <png...>
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

for (const file of process.argv.slice(2)) {
  const { width, height, data } = decodePng(readFileSync(file));
  const buckets = new Array(11).fill(0);
  let mean = 0;
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3];
    mean += a;
    buckets[Math.min(10, Math.floor(a / 26))]++;
  }
  const total = width * height;
  mean /= total;
  const pct = buckets.map((n) => ((n / total) * 100).toFixed(1).padStart(5));
  console.log(`${basename(file).padEnd(18)} ${String(width).padStart(4)}x${String(height).padEnd(4)} mean=${mean.toFixed(1)}`);
  console.log(`   alpha 0-25:${pct[0]}%  26-77:${pct[1]}% ${pct[2]}%  78-129:${pct[3]}% ${pct[4]}%  130-181:${pct[5]}% ${pct[6]}%  182-255:${pct[7]}% ${pct[8]}% ${pct[9]}% ${pct[10]}%`);
}
