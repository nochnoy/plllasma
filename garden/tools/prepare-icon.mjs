// Bakes the page's own icon — `assets-source/ghost.gif`, the one picture of the port that is not part
// of the hall — into `frontend/public/favicon.ico`, which `index.html` hands the browser as `<link rel="icon">`.
//
// The source is 16x16, and a favicon is looked at at 16x16 (the tab, the address bar) and at twice or
// three times that (a screen with a doubled pixel, a bookmark's own tile), so the bake is one `.ico`
// holding the three: the size the source is, and 2x and 3x it. Nearest-neighbour, not a smooth
// enlargement — the artwork is pixel art, one texel to the pixel, and a blurred ghost is a ghost
// nobody drew.
//
// The source is a GIF and it is read here rather than handed to the browser as it is: the tooling of
// this project has no dependencies (`tools/png.mjs` is hand-rolled the same way), and the icon is the
// one picture the port has to bake to a size — what a browser is handed is what it draws, at the
// size it asks for and no other.
//
// Only the first frame is read. The source icon has one frame anyway, and a favicon is a still
// picture: a browser that carried the small amount of animation a GIF could hold would be the only
// one showing something different from everybody else.
//
// Usage: node tools/prepare-icon.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'assets-source', 'ghost.gif');
const OUT = join(root, 'frontend', 'public', 'favicon.ico');
/** The sizes the icon is baked at: the source's own, and the two a doubled or tripled pixel asks for. */
const SIZES = [16, 32, 48];

/** How many colours a colour table of this descriptor holds: `2 ^ (size + 1)`, per the format. */
function tableColours(packed) {
  return 1 << ((packed & 0x07) + 1);
}

/** One colour table, as `[r, g, b]` triples. */
function readTable(buf, at, count) {
  const table = [];
  for (let i = 0; i < count; i++) {
    table.push([buf[at + i * 3], buf[at + i * 3 + 1], buf[at + i * 3 + 2]]);
  }
  return table;
}

/**
 * GIF's own LZW, which is the variably-sized one: the codes start just above the palette's range, the
 * clear code resets the dictionary, and the width of a code grows as the dictionary fills up.
 */
function decodeLzw(bytes, minCodeSize, pixels) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const out = new Uint8Array(pixels);
  let written = 0;
  let dictionary;
  let codeSize;
  let next;
  let previous = null;
  let bits = 0;
  let held = 0;
  const reset = () => {
    dictionary = [];
    for (let i = 0; i < clearCode; i++) dictionary[i] = [i];
    codeSize = minCodeSize + 1;
    next = endCode + 1;
    previous = null;
  };
  reset();
  for (const byte of bytes) {
    bits |= byte << held;
    held += 8;
    while (held >= codeSize) {
      const code = bits & ((1 << codeSize) - 1);
      bits >>= codeSize;
      held -= codeSize;
      if (code === clearCode) {
        reset();
        continue;
      }
      if (code === endCode) return out;
      // A code the dictionary has not got is the one entry a decoder builds as it goes — the previous
      // entry with its own first pixel on the end of it — and it is always the very next one. Any other
      // code that is missing is a broken file rather than a case to guess at.
      let entry = dictionary[code];
      if (!entry) {
        if (!previous || code !== next) throw new Error(`gif: code ${code} is not in the dictionary`);
        entry = [...previous, previous[0]];
      }
      for (const index of entry) if (written < out.length) out[written++] = index;
      if (previous) {
        dictionary[next++] = [...previous, entry[0]];
        if (next === 1 << codeSize && codeSize < 12) codeSize++;
      }
      previous = entry;
    }
  }
  return out;
}

/** An interlaced picture's four passes put back into rows, in place: the format's own order. */
function deinterlace(indices, width, height) {
  const rows = new Uint8Array(indices.length);
  const order = [];
  for (const [start, step] of [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ]) {
    for (let y = start; y < height; y += step) order.push(y);
  }
  for (let y = 0; y < height; y++) {
    rows.set(indices.subarray(order[y] * width, (order[y] + 1) * width), y * width);
  }
  indices.set(rows);
}

/**
 * The source's own first frame, as RGBA, one byte per channel per pixel.
 *
 * Only what a still frame needs is read: the logical screen, the colour table the frame is drawn with,
 * the transparency the graphic control extension before it declares, and the frame's own LZW data. A
 * frame smaller than the screen is put where its descriptor says it goes, on a transparent screen.
 */
function readGif(buf) {
  const signature = buf.subarray(0, 6).toString('latin1');
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    throw new Error(`${SOURCE} is not a GIF (it starts with ${JSON.stringify(signature)})`);
  }
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  const screen = buf[10];
  const global = screen & 0x80 ? readTable(buf, 13, tableColours(screen)) : null;
  let at = 13 + (global ? tableColours(screen) * 3 : 0);
  let transparent = -1;
  while (at < buf.length) {
    const marker = buf[at++];
    if (marker === 0x21) {
      const label = buf[at++];
      const size = buf[at];
      if (label === 0xf9 && buf[at + 1] & 0x01) transparent = buf[at + 4];
      at += size + 1;
      while (buf[at] !== 0) at += buf[at] + 1;
      at++;
      continue;
    }
    if (marker === 0x3b) break;
    if (marker !== 0x2c) throw new Error(`gif: unknown block 0x${marker.toString(16)} at ${at - 1}`);
    const frame = {
      left: buf.readUInt16LE(at),
      top: buf.readUInt16LE(at + 2),
      width: buf.readUInt16LE(at + 4),
      height: buf.readUInt16LE(at + 6),
      packed: buf[at + 8],
    };
    at += 9;
    const local = frame.packed & 0x80 ? readTable(buf, at, tableColours(frame.packed)) : null;
    if (local) at += tableColours(frame.packed) * 3;
    const table = local ?? global;
    if (!table) throw new Error('gif: the frame has no colour table to draw itself with');
    const minCodeSize = buf[at++];
    const blocks = [];
    let size = buf[at++];
    while (size > 0) {
      blocks.push(buf.subarray(at, at + size));
      at += size;
      size = buf[at++];
    }
    const indices = decodeLzw(Buffer.concat(blocks), minCodeSize, frame.width * frame.height);
    if (frame.packed & 0x40) deinterlace(indices, frame.width, frame.height);
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const index = indices[y * frame.width + x];
        if (index === transparent) continue;
        const [r, g, b] = table[index];
        const to = ((frame.top + y) * width + frame.left + x) * 4;
        rgba[to] = r;
        rgba[to + 1] = g;
        rgba[to + 2] = b;
        rgba[to + 3] = 255;
      }
    }
    return { width, height, rgba };
  }
  throw new Error('gif: the file holds no frame at all');
}

/** The icon's own picture at `size`, blown up from the source by whole texels. */
function scale(picture, size) {
  const step = size / picture.width;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.floor(y / step);
    for (let x = 0; x < size; x++) {
      const sx = Math.floor(x / step);
      const from = (sy * picture.width + sx) * 4;
      rgba.set(picture.rgba.subarray(from, from + 4), (y * size + x) * 4);
    }
  }
  return { width: size, height: size, rgba };
}

/**
 * One 32-bit image as an `.ico` holds it: the header Windows has always drawn icons with — the height
 * doubled, the mask under the colours counting as the second copy of the picture — the pixels bottom
 * row first and blue first, and the one-bit mask that says what is transparent. An alpha channel on
 * its own would do, but half the world has always ignored it, so the mask says it too.
 */
function icoImage(picture) {
  const size = picture.width;
  const stride = size * 4;
  const maskStride = ((size + 31) >> 5) * 4;
  const bytes = Buffer.alloc(40 + stride * size + maskStride * size);
  bytes.writeUInt32LE(40, 0);
  bytes.writeInt32LE(size, 4);
  bytes.writeInt32LE(size * 2, 8);
  bytes.writeUInt16LE(1, 12);
  bytes.writeUInt16LE(32, 14);
  bytes.writeUInt32LE(stride * size + maskStride * size, 20);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const from = ((size - 1 - y) * size + x) * 4;
      const to = 40 + y * stride + x * 4;
      bytes[to] = picture.rgba[from + 2];
      bytes[to + 1] = picture.rgba[from + 1];
      bytes[to + 2] = picture.rgba[from];
      bytes[to + 3] = picture.rgba[from + 3];
      if (picture.rgba[from + 3] < 128) {
        bytes[40 + stride * size + y * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return bytes;
}

/** The whole `.ico`: one directory entry per picture, then the pictures themselves, one after another. */
function ico(pictures) {
  const images = pictures.map(icoImage);
  const directory = 6 + images.length * 16;
  const bytes = Buffer.alloc(directory + images.reduce((sum, image) => sum + image.length, 0));
  bytes.writeUInt16LE(0, 0);
  bytes.writeUInt16LE(1, 2);
  bytes.writeUInt16LE(images.length, 4);
  let at = directory;
  images.forEach((image, i) => {
    const entry = 6 + i * 16;
    // Everything here is smaller than 256, so a size is a byte; the format writes the one that is not
    // as nothing at all, which is what the shift to 0 would be for.
    bytes[entry] = pictures[i].width >= 256 ? 0 : pictures[i].width;
    bytes[entry + 1] = pictures[i].height >= 256 ? 0 : pictures[i].height;
    bytes.writeUInt16LE(1, entry + 4);
    bytes.writeUInt16LE(32, entry + 6);
    bytes.writeUInt32LE(image.length, entry + 8);
    bytes.writeUInt32LE(at, entry + 12);
    bytes.set(image, at);
    at += image.length;
  });
  return bytes;
}

const source = readGif(readFileSync(SOURCE));
if (source.width !== source.height) {
  throw new Error(`the source icon is ${source.width}x${source.height}, and a favicon is a square`);
}
const bytes = ico(SIZES.map((size) => scale(source, size)));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, bytes);
const baked = SIZES.map((size) => `${size}x${size}`).join(', ');
console.log(`icon -> ${OUT.replace(root, '.')}: ${baked} from ${source.width}x${source.height}, ${bytes.length} bytes`);
