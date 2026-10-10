// Re-bakes every portrait of every character at the size the game draws its cards in
// (`PORTRAIT_WIDTH`/`PORTRAIT_HEIGHT` in `frontend/src/game/characters.ts`), in place.
//
// The portraits arrive from the artwork at whatever size the artist's files were, and the strip of
// cards draws them at one fixed size whatever the files measure (a stray portrait must not be able
// to move the strip about, see `Scene.dressCard`) — so the files are brought to that size here
// rather than left for the renderer to resample every frame.
//
// The resample is an area average, exactly the one `prepare-assets.mjs` cuts the seed sheet with:
// every destination texel is the mean of the source texels it covers, weighted by how much of them
// it covers, because that is what keeps a shrinking picture from aliasing into noise. Alpha is
// averaged the same way, straight rather than premultiplied — a portrait is a photograph that
// fills its tile, and the faint edges of the alpha ramp weigh so little at this scale that the
// difference is not worth the arithmetic.
//
// Usage: node tools/resize-portraits.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHARACTERS = join(root, 'frontend', 'public', 'assets', 'characters');

/** The card every portrait comes out as, in texels — the size `characters.ts` lays its cards out in. */
const WIDTH = 120;
const HEIGHT = 120;

function overlap(from0, from1, to0, to1) {
  return Math.max(0, Math.min(from1, to1) - Math.max(from0, to0));
}

function shrink(picture) {
  const out = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let j = 0; j < HEIGHT; j++) {
    const top = (j * picture.height) / HEIGHT;
    const bottom = ((j + 1) * picture.height) / HEIGHT;
    for (let i = 0; i < WIDTH; i++) {
      const left = (i * picture.width) / WIDTH;
      const right = ((i + 1) * picture.width) / WIDTH;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let total = 0;
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) {
        const wy = overlap(top, bottom, sy, sy + 1);
        if (wy <= 0) continue;
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const weight = wy * overlap(left, right, sx, sx + 1);
          if (weight <= 0) continue;
          const si = (sy * picture.width + sx) * 4;
          r += picture.data[si] * weight;
          g += picture.data[si + 1] * weight;
          b += picture.data[si + 2] * weight;
          a += picture.data[si + 3] * weight;
          total += weight;
        }
      }
      if (total <= 0) continue;
      const di = (j * WIDTH + i) * 4;
      out[di] = Math.round(r / total);
      out[di + 1] = Math.round(g / total);
      out[di + 2] = Math.round(b / total);
      out[di + 3] = Math.round(a / total);
    }
  }
  return out;
}

for (const folder of readdirSync(CHARACTERS, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  const portraits = join(CHARACTERS, folder.name, 'portrait');
  let read;
  try {
    read = readdirSync(portraits);
  } catch {
    continue;
  }
  for (const file of read) {
    if (!file.endsWith('.png')) continue;
    const path = join(portraits, file);
    const picture = decodePng(readFileSync(path));
    writeFileSync(path, encodePng(WIDTH, HEIGHT, shrink(picture)));
    console.log(`${folder.name}/portrait/${file} ${picture.width}x${picture.height} -> ${WIDTH}x${HEIGHT}`);
  }
}
