// Bakes the girl body parts extracted from the original SWF into bone-aligned PNGs
// plus a small metadata module consumed by the game.
//
// The original Flash movie stores every body part as a JPEG3 bitmap placed inside a
// DefineShape with an authored fill matrix. That matrix is what maps "bitmap pixels"
// to "shape pixels" (and it rotates/flips the portrait artwork so that the part runs
// along the shape's +X axis, which is the axis the ragdoll bone rotates around).
//
// The baked artwork keeps the shape's own directions, and the game relies on them: the
// distal end of every part (crown, hand, foot, shoulders) ends up at shape -X, so
// scene.ts turns each sprite's +X towards the *first* particle of its bone pair.
//
// Baking therefore does four things per part:
//   1. divide the bitmap's own matte back out of its colours — the JPEG in this movie is
//      the artwork *premultiplied* by the mask, so recovering the colour is what turns
//      the dark rim along every part boundary into skin (see recoverColour),
//   2. grow that colour outwards over the texels the matte hides, and blend the faintest
//      end of the ramp into it, so the parts fade into skin rather than into JPEG noise
//      (see bleedColour),
//   3. resample the bitmap through the inverse of the fill matrix (premultiplied, so a
//      transparent neighbour contributes no colour), keeping the authored alpha ramp
//      minus its noisiest floor,
//   4. place the shape origin in the middle of a uniform 150x150 tile, so that one grid
//      can show every part side by side and the offset the artwork has against its own
//      origin is written down as the part's pivot (see docs/assets.md).
//
// The tile is baked at the density the movie itself drew at — one texel per world pixel, which
// is what its bitmaps are: see OUT_SCALE — so the artwork is neither resampled up nor softened.
//
// The parts land in the default character's folder (`frontend/public/assets/characters/elena/parts`),
// since every character shares this same set of pivots and tiles and differs only in artwork.
// The same run seeds that character's portraits out of `assets-source/faces.png` — six faces, and only
// where a card is missing, since a character's pictures are its own art — and re-bakes the box's own
// picture out of `assets-source/box.png` (see the last section).
//
// Usage: node tools/prepare-assets.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets-source', 'swf-tags');
/**
 * The character the baked parts belong to: the default one of `frontend/src/game/characters.ts`, which is the
 * `elena` of `assets/characters/elena`. The two have to agree — this tool cannot import the module,
 * because that module is TypeScript and this one is not.
 */
const CHARACTER = 'elena';
const OUT_PARTS = join(root, 'frontend', 'public', 'assets', 'characters', CHARACTER, 'parts');
const OUT_PORTRAITS = join(root, 'frontend', 'public', 'assets', 'characters', CHARACTER, 'portrait');
/**
 * The box's picture: where its source lies, where the bake goes, and how big it comes out in texels.
 *
 * These numbers have to agree with `BOX_TEXTURE` in `frontend/src/game/block.ts` — this tool cannot import that
 * module, because it is TypeScript and this one is not. The box the game draws is 80 x 58 world pixels
 * (half a metre wide, and as tall as this picture is), and one texel is half a world pixel, so the bake
 * is the box at twice its size. That density is the photograph's own, not the girl's: her parts come
 * out of the movie at 1:1 (see {@link OUT_SCALE}), while the box's photo arrives with four texels per
 * world pixel and would only lose detail if it were baked at one. The 116 is 218/300 of the 160 the
 * photo's own ratio asks for, rounded to the texel: the one place the picture and the box differ, by a
 * fifth of a per cent.
 */
const BOX_TEXTURE = { file: 'box.png', width: 160, height: 116, unitsPerTexel: 0.5 };
const BOX_SOURCE = join(root, 'assets-source', BOX_TEXTURE.file);
const OUT_BOX = join(root, 'frontend', 'public', 'assets', 'box');

/**
 * How many texels the artwork is baked at per world pixel.
 *
 * One, because that is the density the movie itself drew at: its bitmaps are about one texel per
 * world pixel — the head's is 49x63 texels for the 63x49 world pixels its shape places it in and the
 * thigh's matches its own shape exactly, while the rest are magnified by their fill matrices by up to
 * 17% (see the table in `docs/assets.md`). Baking at 1:1 is therefore what the stage showed: nothing
 * is resampled up, nothing is softened, and the tile is four times smaller than a 2x bake of it would
 * be. A hi-dpi screen magnifies it then, which is exactly what the movie did when the player
 * stretched the player to full screen — and the browser's own filtering does that better than a
 * bake-time resample does.
 */
const OUT_SCALE = 1;
/**
 * The square every part is baked into, in texels — and, at {@link OUT_SCALE} 1, in world pixels too.
 *
 * All seven parts share one canvas size so that a single grid can show them side by side — which is
 * what `tools/ascii.mjs` and `tools/check-textures.mjs` do — and so that a part's texture never has
 * to be measured to know how much room the rig has. The artwork of the biggest part reaches 52 world
 * pixels from its origin (the thigh's 51.5, then the hand's 45 and the chest's 44.1), so 150 is a
 * comfortable square around it, and the transparent rest costs nothing but texture memory: the parts
 * are drawn with the resolution of the texture, not with a scale, so padding a part cannot make it
 * look bigger (see `Scene.load`).
 */
const TILE = 150;
/** World pixels one texel of the artwork covers: the density the bake is made at. */
const UNITS_PER_TEXEL = 1 / OUT_SCALE;

// scaleX/scaleY/rotateSkew/translate straight from the SWF fill style records,
// converted to pixel units with the same convention the Flash player uses:
//   x' = a*bx + b*by + tx
//   y' = c*bx + d*by + ty
// (a = scaleX, b = rotateSkew1, c = rotateSkew0, d = scaleY)
//
// The four of them are a rotation with a mirror in it (the artwork is drawn upright and the bone runs
// sideways) and they come out at about one texel of bitmap per world pixel — 1.0 for the head and the
// thigh, 0.85 for the chest — which is the density the bake keeps: see {@link OUT_SCALE}.
const PARTS = {
  head: { bitmap: 20, a: 0, b: 1, c: 1, d: 0, tx: -32.5, ty: -18.5, bounds: [-32.5, 30.5, -18.5, 30.5] },
  chest: { bitmap: 26, a: 0, b: 1.1739, c: 1.0951, d: 0, tx: -44.1, ty: -27, bounds: [-44.1, 31.1, -27, 24.5] },
  stomach: { bitmap: 23, a: 0, b: -1.0653, c: -1.0653, d: 0, tx: 33.9, ty: 26.25, bounds: [-30, 33.9, -25.9, 26.3] },
  thigh: { bitmap: 29, a: 0, b: -1, c: -1, d: 0, tx: 51.5, ty: 20.5, bounds: [-41.5, 51.5, -22.5, 20.5] },
  leg: { bitmap: 14, a: 0, b: -1.0872, c: 1.0872, d: 0, tx: 42.7, ty: -27.75, bounds: [-47.5, 42.7, -27.75, 19] },
  arm: { bitmap: 17, a: 0, b: -1.1591, c: -1.1591, d: 0, tx: 38, ty: 17, bounds: [-38.5, 38, -16.6, 17] },
  hand: { bitmap: 11, a: 0, b: -1.141, c: -1.141, d: 0, tx: 45, ty: 14.5, bounds: [-44, 45, -14, 14.5] },
};

/**
 * Floor of the mask's alpha ramp. The authoring tool baked a soft, several-texel-wide matte, and its
 * faintest end (1..10) is noise that only produces a halo, so the floor is dropped; the rest of the
 * ramp is shifted by it rather than reshaped, so the parts still fade out like they do in the SWF.
 */
const ALPHA_FLOOR = 10;
/**
 * Where the matte stops being a guess. Below this the stored colour is mostly JPEG noise — which the
 * division in {@link recoverColour} amplifies — so the colour is blended towards the artwork's own
 * interior colour, and a part fades into skin instead of into an orange or grey rim.
 */
const CONFIDENT_ALPHA = 128;
/** How far the interior colour is grown outwards, in texels. */
const BLEED_RADIUS = 8;

function cleanAlpha(a) {
  return Math.min(1, Math.max(0, (a - ALPHA_FLOOR) / (255 - ALPHA_FLOOR)));
}

/**
 * What the SWF actually stores: a colour, and the matte that is *already multiplied into it*.
 *
 * DefineBitsJPEG3 keeps a JPEG and an alpha channel apart, but the JPEG of this movie is not a
 * straight photograph. Every texel of it is the artwork's colour scaled by that texel's own matte —
 * measure it and the ramp reads `skin * a` while the flat interior reads `skin` at a = 255 — and the
 * drawing tool then cut the shape out with the same matte. Compositing such a bitmap as if it were
 * straight colour is what leaves a dark rim along every part boundary, because the boundary is
 * exactly where the matte is small: the author drew the parts at 1:1 on a 550x400 stage, where that
 * rim was one pixel of the photograph's own soft edge, and the port draws a part two hundred device
 * pixels long, so the same band shows up as a black seam at the top of a thigh.
 *
 * Dividing the matte back out returns the body's own colour there — skin fading to nothing, rather
 * than a shadow fading to nothing. Texels the matte hides completely (below {@link ALPHA_FLOOR}) have
 * nothing left to divide, and are left for {@link bleedColour} to fill in.
 */
function recoverColour(src) {
  const count = src.width * src.height;
  const colour = new Float32Array(count * 3);
  const alpha = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const a = src.data[i * 4 + 3];
    alpha[i] = a;
    if (a < ALPHA_FLOOR) continue;
    const k = 255 / a;
    colour[i * 3] = Math.min(255, src.data[i * 4] * k);
    colour[i * 3 + 1] = Math.min(255, src.data[i * 4 + 1] * k);
    colour[i * 3 + 2] = Math.min(255, src.data[i * 4 + 2] * k);
  }
  return { width: src.width, height: src.height, colour, alpha };
}

/**
 * Grows the artwork's interior colour outwards over everything that has no colour of its own, and
 * blends the faint end of the matte into it.
 *
 * Two things need this. The texels the matte hides completely still sit in the texture, and a
 * bilinear sample near the edge mixes them in — left black, they grey the edge down. And where the
 * matte is faint, the recovered colour is mostly JPEG noise, while all the eye ever sees is the skin
 * it should have been.
 */
function bleedColour(part) {
  const { width, height, colour, alpha } = part;
  const count = width * height;
  const grown = Float32Array.from(colour);
  const known = new Uint8Array(count);
  for (let i = 0; i < count; i++) known[i] = alpha[i] >= CONFIDENT_ALPHA ? 1 : 0;

  for (let pass = 0; pass < BLEED_RADIUS; pass++) {
    const nextColour = Float32Array.from(grown);
    const nextKnown = Uint8Array.from(known);
    let filled = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (known[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const k = yy * width + xx;
            if (!known[k]) continue;
            r += grown[k * 3]; g += grown[k * 3 + 1]; b += grown[k * 3 + 2]; n++;
          }
        }
        if (!n) continue;
        nextColour[i * 3] = r / n;
        nextColour[i * 3 + 1] = g / n;
        nextColour[i * 3 + 2] = b / n;
        nextKnown[i] = 1;
        filled++;
      }
    }
    grown.set(nextColour);
    known.set(nextKnown);
    if (!filled) break;
  }

  for (let i = 0; i < count; i++) {
    const a = alpha[i];
    const weight = a >= CONFIDENT_ALPHA ? 1 : a <= ALPHA_FLOOR ? 0 : a / CONFIDENT_ALPHA;
    for (let c = 0; c < 3; c++) {
      const interior = grown[i * 3 + c];
      const own = a < ALPHA_FLOOR ? interior : colour[i * 3 + c];
      colour[i * 3 + c] = interior * (1 - weight) + own * weight;
    }
  }
}

function sampleBilinear(src, u, v) {
  const x = Math.min(src.width - 1, Math.max(0, u));
  const y = Math.min(src.height - 1, Math.max(0, v));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const out = [0, 0, 0, 0];
  const w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  const idx = [
    (y0 * src.width + x0) * 4,
    (y0 * src.width + x1) * 4,
    (y1 * src.width + x0) * 4,
    (y1 * src.width + x1) * 4,
  ];
  for (let k = 0; k < 4; k++) {
    out[k] =
      src.data[idx[0] + k] * w[0] +
      src.data[idx[1] + k] * w[1] +
      src.data[idx[2] + k] * w[2] +
      src.data[idx[3] + k] * w[3];
  }
  return out;
}

/**
 * Puts the colour back under the matte, for resampling. Sampling premultiplied texels is what keeps a
 * transparent neighbour from pulling the average towards its own colour — even a bleached one — and
 * the division in the resample loop takes the matte back out again.
 */
function premultiply(part) {
  const count = part.width * part.height;
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const alpha = cleanAlpha(part.alpha[i]) * 255;
    const k = alpha / 255;
    data[i * 4] = part.colour[i * 3] * k;
    data[i * 4 + 1] = part.colour[i * 3 + 1] * k;
    data[i * 4 + 2] = part.colour[i * 3 + 2] * k;
    data[i * 4 + 3] = alpha;
  }
  return { width: part.width, height: part.height, data };
}
mkdirSync(OUT_PARTS, { recursive: true });
mkdirSync(OUT_PORTRAITS, { recursive: true });
const meta = [];

for (const [name, part] of Object.entries(PARTS)) {
  const bitmap = recoverColour(decodePng(readFileSync(join(SRC, `bitmap_${part.bitmap}.png`))));
  bleedColour(bitmap);
  const src = premultiply(bitmap);
  const [xMin, xMax, yMin, yMax] = part.bounds;
  // The tile is the shape's own space scaled by OUT_SCALE, with the shape origin — the point the
  // bone turns around — in the middle of it. The artwork is *not* centred on that origin (the shape
  // bounds are asymmetric by a few pixels), so it lands off-centre in the tile: that offset is what
  // the pivot in the metadata records, and it is fixed for every character of the game — a character
  // brings artwork, not a rig. At OUT_SCALE 1 a destination texel maps to a source texel almost
  // exactly — the bitmap's own grid sits half a texel off the shape's, which is what the bilinear
  // sample below is left to smooth over — so the artwork arrives with the detail it was authored
  // with rather than with a resample of it.
  const half = TILE / 2;
  const reach = Math.max(Math.abs(xMin), Math.abs(xMax), Math.abs(yMin), Math.abs(yMax));
  if (Math.ceil(reach * OUT_SCALE) > half) {
    throw new Error(`${name} does not fit a ${TILE}x${TILE} tile: it reaches ${reach} world pixels`);
  }
  const out = new Uint8Array(TILE * TILE * 4);

  // inverse of [[a, b], [c, d]]
  const det = part.a * part.d - part.b * part.c;
  const ia = part.d / det;
  const ib = -part.b / det;
  const ic = -part.c / det;
  const id = part.a / det;

  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      const X = (i + 0.5 - half) / OUT_SCALE;
      const Y = (j + 0.5 - half) / OUT_SCALE;
      const dx = X - part.tx;
      const dy = Y - part.ty;
      const bx = ia * dx + ib * dy;
      const by = ic * dx + id * dy;
      const di = (j * TILE + i) * 4;
      if (bx < -0.5 || by < -0.5 || bx > src.width + 0.5 || by > src.height + 0.5) continue;
      const s = sampleBilinear(src, bx - 0.5, by - 0.5);
      const alpha = s[3] / 255;
      if (alpha <= 0.002) continue;
      out[di] = Math.min(255, Math.round(s[0] / alpha));
      out[di + 1] = Math.min(255, Math.round(s[1] / alpha));
      out[di + 2] = Math.min(255, Math.round(s[2] / alpha));
      out[di + 3] = Math.round(alpha * 255);
    }
  }

  const file = `${name}.png`;
  writeFileSync(join(OUT_PARTS, file), encodePng(TILE, TILE, out));
  meta.push({
    name,
    // The folder is the character's, so the metadata holds the file name alone: a character brings
    // its own `parts` folder and the same seven names are read out of it.
    file,
    width: TILE,
    height: TILE,
    pivotX: half,
    pivotY: half,
    unitsPerTexel: UNITS_PER_TEXEL,
    partLen: xMax - xMin,
    depth: yMax - yMin,
  });
  console.log(
    `${name.padEnd(8)} partLen=${(xMax - xMin).toFixed(1)} depth=${(yMax - yMin).toFixed(1)} ` +
      `-> ${file} ${TILE}x${TILE} pivot=${half},${half}`,
  );
}

// --------------------------------------------------------------------- portraits
//
// A character's portraits are its own art: eight faces, one per step of pain, in up to three sets
// (`<n>-1.png` .. `<n>-3.png`, see `characters.ts`), at the size the game lays its cards out in
// (`PORTRAIT_WIDTH`/`PORTRAIT_HEIGHT` in `frontend/src/game/characters.ts`). This sheet is only what
// seeds a character that arrives without any — `assets-source/faces.png` draws six faces in a 3x2 grid,
// so six cards of the first set is all it can hand over, and the levels and sets above them stay empty
// until the artwork brings them. A card that is already on disk is never written over: the pictures
// belong to the character, not to this tool.
//
// Every cell is cropped to the portrait's own 1:1 (the aspect the cards are drawn in, so nothing is
// squeezed) and then resampled down to 120x120 by averaging every source texel a destination texel
// covers. What arrives larger from the artwork — the -2/-3 sets come as 1024x1024 sources of their
// own — is brought to the same 120x120 by `tools/resize-portraits.mjs`, the same average, in place.

/** The sheet a character that has no pictures at all is seeded from. */
const FACES = join(root, 'assets-source', 'faces.png');
/** How that sheet is laid out: six faces, three across. */
const FACE_COLUMNS = 3;
const FACE_ROWS = 2;
/** The card that comes out of every cell, and the hairline the sheet draws between cells. */
const PORTRAIT_WIDTH = 120;
const PORTRAIT_HEIGHT = 120;
/** The set the seed lands in: the first, the plain faces the artwork drew. */
const PORTRAIT_SET = 1;
const FACE_INSET = 3;

/**
 * How much of a source texel a destination texel covers, along one axis: the length of the overlap of
 * the two intervals, zero for a texel the destination texel does not reach. This is what makes the
 * resampling an average over the whole area rather than over its centre texels, which is what matters
 * for the parts whose artwork the movie draws a few per cent larger than its own bitmap (see the
 * table in `docs/assets.md`) and for the box, which is halved: a texel on the edge of the window
 * would otherwise count as much as one in the middle of it.
 */
function overlap(from0, from1, to0, to1) {
  return Math.max(0, Math.min(from1, to1) - Math.max(from0, to0));
}

function cutPortraits(sheet) {
  const cellWidth = sheet.width / FACE_COLUMNS;
  const cellHeight = sheet.height / FACE_ROWS;
  // The largest window of the portrait's own 1:1 that fits a cell with its hairline left out,
  // centred in the cell.
  const windowWidth = Math.min(
    cellWidth - 2 * FACE_INSET,
    ((cellHeight - 2 * FACE_INSET) * PORTRAIT_WIDTH) / PORTRAIT_HEIGHT,
  );
  const windowHeight = (windowWidth * PORTRAIT_HEIGHT) / PORTRAIT_WIDTH;
  for (let index = 0; index < FACE_COLUMNS * FACE_ROWS; index++) {
    const left = (index % FACE_COLUMNS) * cellWidth + (cellWidth - windowWidth) / 2;
    const top = Math.floor(index / FACE_COLUMNS) * cellHeight + (cellHeight - windowHeight) / 2;
    const out = new Uint8Array(PORTRAIT_WIDTH * PORTRAIT_HEIGHT * 4);
    for (let j = 0; j < PORTRAIT_HEIGHT; j++) {
      const y0 = top + (j * windowHeight) / PORTRAIT_HEIGHT;
      const y1 = top + ((j + 1) * windowHeight) / PORTRAIT_HEIGHT;
      for (let i = 0; i < PORTRAIT_WIDTH; i++) {
        const x0 = left + (i * windowWidth) / PORTRAIT_WIDTH;
        const x1 = left + ((i + 1) * windowWidth) / PORTRAIT_WIDTH;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let total = 0;
        for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
          const wy = overlap(y0, y1, sy, sy + 1);
          if (wy <= 0) continue;
          for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
            // A texel of the sheet's own edge, or past it, weighs nothing and is never read.
            const weight = wy * overlap(x0, x1, sx, sx + 1);
            if (weight <= 0) continue;
            const si = (sy * sheet.width + sx) * 4;
            r += sheet.data[si] * weight;
            g += sheet.data[si + 1] * weight;
            b += sheet.data[si + 2] * weight;
            a += sheet.data[si + 3] * weight;
            total += weight;
          }
        }
        if (total <= 0) continue;
        const di = (j * PORTRAIT_WIDTH + i) * 4;
        out[di] = Math.round(r / total);
        out[di + 1] = Math.round(g / total);
        out[di + 2] = Math.round(b / total);
        out[di + 3] = Math.round(a / total);
      }
    }
    const path = join(OUT_PORTRAITS, `${index}-${PORTRAIT_SET}.png`);
    if (existsSync(path)) {
      console.log(`portrait ${index}-${PORTRAIT_SET} -> kept, this character has a picture of its own`);
      continue;
    }
    writeFileSync(path, encodePng(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, out));
    console.log(`portrait ${index} -> ${PORTRAIT_WIDTH}x${PORTRAIT_HEIGHT}`);
  }
}

cutPortraits(decodePng(readFileSync(FACES)));

// --------------------------------------------------------------------- the box

/**
 * The box's own picture, re-baked to the size the game draws it at.
 *
 * The box is the port's own object — nothing in the SWF to read it out of — so its picture is the one
 * asset here that is not the movie's: it arrives as a plain photo (`assets-source/box.png`) and this
 * only rescales it, to twice the box the game draws (see `BOX_TEXTURE`). Halving a photograph is done
 * with an area average — every texel of the bake is the mean of the photo's texels that fall under it,
 * weighted by how much of them does — because that is what keeps a shrinking picture from aliasing
 * into noise, which is the same reason the parts are resampled this way rather than point-sampled.
 */
function bakeBox(picture) {
  const { width, height } = BOX_TEXTURE;
  const out = new Uint8Array(width * height * 4);
  const stepX = picture.width / width;
  const stepY = picture.height / height;
  for (let j = 0; j < height; j++) {
    const top = j * stepY;
    const bottom = (j + 1) * stepY;
    for (let i = 0; i < width; i++) {
      const left = i * stepX;
      const right = (i + 1) * stepX;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let total = 0;
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) {
        const weightY = Math.min(sy + 1, bottom) - Math.max(sy, top);
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const weight = weightY * (Math.min(sx + 1, right) - Math.max(sx, left));
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
      const di = (j * width + i) * 4;
      out[di] = Math.round(r / total);
      out[di + 1] = Math.round(g / total);
      out[di + 2] = Math.round(b / total);
      out[di + 3] = Math.round(a / total);
    }
  }
  mkdirSync(OUT_BOX, { recursive: true });
  writeFileSync(join(OUT_BOX, BOX_TEXTURE.file), encodePng(width, height, out));
  console.log(`box -> ${width}x${height} (from ${picture.width}x${picture.height})`);
}

bakeBox(decodePng(readFileSync(BOX_SOURCE)));

const ts = `// GENERATED by tools/prepare-assets.mjs — do not edit by hand.
/** Baked body part textures: bone-aligned artwork, one pivot per part, all tiles the same square. */
export interface PartAsset {
  /** File name inside a character's own \`parts\` folder, i.e. \`assets/characters/<folder>/parts\`. */
  readonly file: string;
  /** Texture size, in pixels. Every part is baked into this same square. */
  readonly width: number;
  readonly height: number;
  /**
   * Where the bone turns, in pixels from the texture's top-left corner: the origin of the SWF's own
   * shape, which is the point the sprite is anchored to. All characters share it — the rig is the
   * movie's, and a character brings artwork to it, not a rig.
   */
  readonly pivotX: number;
  readonly pivotY: number;
  /**
   * World pixels one texel of the artwork covers. The sprite is drawn at full size and this density
   * lives in the asset itself (the scene gives the texture this resolution), rather than in a scale
   * the renderer would apply. 1 is the movie's own density — one texel per world pixel — and the
   * only bake that draws the artwork without resampling it.
   */
  readonly unitsPerTexel: number;
  /** Length of the artwork along the bone axis, in world pixels. */
  readonly partLen: number;
  /** Extent perpendicular to the bone axis, in world pixels. */
  readonly depth: number;
}

export const PART_ASSETS = {
${meta.map((m) => `  ${m.name}: { file: '${m.file}', width: ${m.width}, height: ${m.height}, pivotX: ${m.pivotX}, pivotY: ${m.pivotY}, unitsPerTexel: ${m.unitsPerTexel}, partLen: ${m.partLen.toFixed(3)}, depth: ${m.depth.toFixed(3)} },`).join('\n')}
} as const satisfies Record<string, PartAsset>;

export type PartName = keyof typeof PART_ASSETS;
`;
const tsPath = join(root, 'frontend', 'src', 'game', 'parts.generated.ts');
mkdirSync(dirname(tsPath), { recursive: true });
writeFileSync(tsPath, ts);
console.log(`wrote ${tsPath}`);
