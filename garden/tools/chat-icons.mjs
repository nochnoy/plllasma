// Writes the chat's own gifs: the little animations a line can be decorated with — a laugh, a heart.
// All of them are GIFs — an animated heart inside a sentence is the same kind of thing as an animated
// face beside a nickname — and all of them are written here by hand, because nothing else in the
// port's tooling emits GIF: the SWF's own artwork comes out of `prepare-assets.mjs` as PNG, and a
// browser has no GIF encoder to hand the job to. The faces beside the names are not written here at
// all: they are the site's own userpics (`i/*.gif`, the ghost's among them).
//
// Usage: node tools/chat-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'frontend', 'public', 'assets', 'chat');

/** Everything here is drawn on a 16x16 grid: a badge and a gif in a message are both 16 px. */
const SIZE = 16;
/** How long a frame of every one of these pictures is shown, in hundredths of a second. */
const DELAY = 8;

/**
 * A GIF89a picture: a global colour table of four entries — index 0 is the transparent one — and one
 * or more 16x16 frames of palette indices, cut into GIF's own sub-blocks.
 */
function writeGif(frames, palette) {
  const bits = 2; // four entries, which is what the size field below has to agree with
  const table = Buffer.alloc(4 * 3);
  palette.forEach(([r, g, b], index) => {
    table[index * 3] = r;
    table[index * 3 + 1] = g;
    table[index * 3 + 2] = b;
  });

  const out = [Buffer.from('GIF89a', 'latin1')];
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(SIZE, 0);
  screen.writeUInt16LE(SIZE, 2);
  // A global table of four (0b11 in the size field), eight bits per primary, not sorted.
  screen[4] = 0x80 | 0x70 | (bits - 1);
  screen[5] = 0; // the background is the table's transparent entry
  screen[6] = 0; // no pixel aspect ratio
  out.push(screen, table);

  // Loop for ever: without this the animation plays once and stops on its second frame.
  out.push(Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0', 'latin1'));
  out.push(Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00]));

  for (const frame of frames) {
    // Graphic control: index 0 is transparent, what a frame does not draw is cleared before the next
    // one (disposal 2), and the delay is in hundredths of a second.
    out.push(Buffer.from([0x21, 0xf9, 0x04, 0x09, DELAY & 0xff, DELAY >> 8, 0x00, 0x00]));
    // The picture itself: at 0,0, as big as the screen, with no table of its own.
    const image = Buffer.alloc(10);
    image[0] = 0x2c;
    image.writeUInt16LE(SIZE, 5);
    image.writeUInt16LE(SIZE, 7);
    out.push(image, Buffer.from([bits]), Buffer.from(subBlocks(lzw(frame, bits))));
  }

  out.push(Buffer.from([0x3b]));
  return Buffer.concat(out);
}

/**
 * The pixels as LZW codes, with the dictionary deliberately left alone: a clear code before every
 * `group` pixels, so the code size never grows and a decoder needs no table of its own. A quarter
 * bigger than a real GIF and the same picture in every decoder, which is what a 16 px emote is worth.
 */
function lzw(pixels, minCode) {
  const clear = 1 << minCode;
  // Entries are added by every code but the first of a group, so a group of `2^minCode - 2` of them
  // fills the table exactly and the code size stays where it is.
  const group = (1 << minCode) - 2;
  const codes = [clear];
  let written = 0;
  for (const index of pixels) {
    codes.push(index);
    written++;
    if (written === group) {
      codes.push(clear);
      written = 0;
    }
  }
  codes.push(clear + 1); // the end code
  return pack(codes, minCode + 1);
}

/** GIF packs its codes least significant bit first, into bytes. */
function pack(codes, codeSize) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const code of codes) {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
    }
  }
  if (bits > 0) bytes.push(buffer & 0xff);
  return bytes;
}

/**
 * GIF's own framing for a byte stream: blocks of at most 255 bytes, then the zero-length one that ends
 * them.
 */
function subBlocks(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const block = bytes.slice(i, i + 255);
    out.push(block.length, ...block);
  }
  out.push(0);
  return out;
}

/** One frame: what colour each of the 16x16 pixels is, as a palette index. */
function frame(paint) {
  const pixels = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) pixels.push(paint(x + 0.5, y + 0.5));
  return pixels;
}

/** Whether a point is inside the disc of radius `r` about (cx, cy). */
function disc(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * A face on a disc of its own colour: two eyes and a smile, with the eyes shut on the second frame —
 * which is all the animation a 16 px badge needs to look alive. The disc's colour comes from the
 * palette; here it only decides which of the indices is which.
 */
function face() {
  const paint = (x, y, open) => {
    if (!disc(x, y, 8, 8, 7.2)) return 0;
    if (open && (disc(x, y, 5.4, 6.2, 1.1) || disc(x, y, 10.6, 6.2, 1.1))) return 2;
    if (!open && y >= 5.9 && y <= 6.6 && ((x >= 4.4 && x <= 6.4) || (x >= 9.6 && x <= 11.6))) return 2;
    // The mouth: the bottom half of a small ring, which is a smile at this size.
    const rx = (x - 8) / 2.9;
    const ry = (y - 9.6) / 2.6;
    const ring = rx * rx + ry * ry;
    if (y >= 9.6 && ring <= 1 && ring >= 0.5) return 2;
    return 1;
  };
  return [frame((x, y) => paint(x, y, true)), frame((x, y) => paint(x, y, false))];
}

/**
 * A heart that beats: the same shape a hair larger on the second frame, which is the whole of what
 * makes it read as animated.
 */
function heart() {
  // The classic implicit heart, (x² + y² - 1)³ - x²y³ ≤ 0, with y pointing up the way its own maths
  // does and the shape scaled to fill the box — it is 2.26 wide in those units and 2.32 tall, so the
  // middle of it wants shifting up a hair.
  const shape = (scale) => {
    const middle = 8 - 0.16 * scale;
    return frame((x, y) => {
      const dx = (x - 8) / scale;
      const dy = (middle - y) / scale;
      return (dx * dx + dy * dy - 1) ** 3 - dx * dx * dy * dy * dy <= 0 ? 1 : 0;
    });
  };
  return [shape(6.2), shape(5.6)];
}

// The gifs a message's body may drop into a sentence — the only pictures the game keeps of the chat,
// now that every face beside a name is the site's own userpic (`i/*.gif`, the ghost's among them): a
// yellow laugh and a beating heart, and nothing else.
const pictures = [
  { name: 'laugh.gif', frames: face(), palette: [[0, 0, 0], [255, 214, 74], [58, 44, 36], [0, 0, 0]] },
  { name: 'heart.gif', frames: heart(), palette: [[0, 0, 0], [224, 86, 110], [0, 0, 0], [0, 0, 0]] },
];

mkdirSync(OUT, { recursive: true });
for (const picture of pictures) {
  const bytes = writeGif(picture.frames, picture.palette);
  writeFileSync(join(OUT, picture.name), bytes);
  console.log(`${picture.name} ${bytes.length} bytes`);
}
console.log('written to', OUT);
