// Renders PNGs as text: silhouette bounding box, centroid, connected components and a coarse
// ASCII preview of the drawn foreground.
// Usage: node tools/look.mjs <png...> [--cols 56] [--ascii] [--threshold 60]
import { analyse, asciiArt } from './image-stats.mjs';

const colsIdx = process.argv.indexOf('--cols');
const cols = colsIdx > 0 ? Number(process.argv[colsIdx + 1]) : 56;
const thIdx = process.argv.indexOf('--threshold');
const threshold = thIdx > 0 ? Number(process.argv[thIdx + 1]) : 60;
const wantAscii = process.argv.includes('--ascii');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));

for (const file of files) {
  const stats = analyse(file, { threshold });
  const name = file.split(/[\\/]/).pop();
  if (!stats.bbox) {
    console.log(`\n=== ${name} (${stats.width}x${stats.height}) === empty`);
    continue;
  }
  const { bbox, centroid } = stats;
  console.log(`\n=== ${name} (${stats.width}x${stats.height}) ===`);
  console.log(
    `foreground px=${stats.pixels} bbox=[${bbox.x0},${bbox.y0}..${bbox.x1},${bbox.y1}] ` +
    `size=${bbox.w}x${bbox.h} centroid=(${centroid.x.toFixed(1)},${centroid.y.toFixed(1)}) ` +
    `components=${stats.components} largest=${stats.largest}`,
  );
  if (wantAscii) for (const line of asciiArt(stats, cols)) console.log(line);
}
