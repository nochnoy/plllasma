// Reports the average colour of each band of a PNG's alpha ramp — both as stored and divided by the
// band's alpha — next to the colour of the fully opaque interior.
//
// The two columns tell the two possible shapes of a soft mask apart in one run:
//
//   * the stored colour is roughly the interior's for every band -> the artwork holds a straight
//     colour, and a fading edge is as invisible as it looks;
//   * the stored colour is roughly interior x alpha (and the divided column is the flat interior)
//     -> the bitmap is *premultiplied* by its own matte. Compositing that as if it were straight
//     colour leaves a dark rim wherever the mask fades — invisible at the size the author drew it,
//     and a black seam across every joint once the artwork is scaled up.
//
// This is how the girl's body parts turned out to be premultiplied, which is why
// tools/prepare-assets.mjs divides the matte back out (see docs/assets.md).
//
// Usage: node tools/alpha-ramp.mjs <png...>
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { decodePng } from './png.mjs';

const BANDS = [
  { name: 'opaque 250+ ', lo: 250, hi: 256 },
  { name: 'ramp  200-249', lo: 200, hi: 250 },
  { name: 'ramp  150-199', lo: 150, hi: 200 },
  { name: 'ramp  100-149', lo: 100, hi: 150 },
  { name: 'ramp   50-99 ', lo: 50, hi: 100 },
  { name: 'ramp   11-49 ', lo: 11, hi: 50 },
  { name: 'ramp    1-10 ', lo: 1, hi: 11 },
];

for (const file of process.argv.slice(2)) {
  const { width, height, data } = decodePng(readFileSync(file));
  console.log(`\n${basename(file).padEnd(18)} ${width}x${height}`);
  for (const band of BANDS) {
    let n = 0;
    let r = 0, g = 0, b = 0;
    let ur = 0, ug = 0, ub = 0;
    for (let i = 0; i < width * height; i++) {
      const a = data[i * 4 + 3];
      if (a < band.lo || a >= band.hi) continue;
      n++;
      r += data[i * 4];
      g += data[i * 4 + 1];
      b += data[i * 4 + 2];
      const k = 255 / a;
      ur += Math.min(255, data[i * 4] * k);
      ug += Math.min(255, data[i * 4 + 1] * k);
      ub += Math.min(255, data[i * 4 + 2] * k);
    }
    if (!n) {
      console.log(`  ${band.name}   (none)`);
      continue;
    }
    const avg = (sum) => (sum / n).toFixed(1).padStart(5);
    console.log(
      `  ${band.name}  n=${String(n).padStart(6)}  as stored ${avg(r)},${avg(g)},${avg(b)}` +
        `   / alpha ${avg(ur)},${avg(ug)},${avg(ub)}`,
    );
  }
}
