// Image statistics used to compare the port against the original movie: foreground mask,
// bounding box, centroid and connected components. Shared by tools/look.mjs (text preview) and
// tools/ruffle-compare.mjs (side-by-side numbers).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Minimal PNG decoder (8-bit truecolour / palette / grayscale, all filter types). */
export function decodePng(buf) {
  let p = 8;
  let width = 0, height = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  let palette = null, trns = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.subarray(p + 4, p + 8).toString('latin1');
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const bpp = Math.max(1, (channels * bitDepth) / 8);
  const stride = Math.ceil((width * channels * bitDepth) / 8);
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let off = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[off++];
    const line = Uint8Array.from(raw.subarray(off, off + stride)); off += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 0xff;
      else if (filter === 2) line[i] = (line[i] + b) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      if (colorType === 6) { out[di] = line[si]; out[di + 1] = line[si + 1]; out[di + 2] = line[si + 2]; out[di + 3] = line[si + 3]; }
      else if (colorType === 2) { out[di] = line[si]; out[di + 1] = line[si + 1]; out[di + 2] = line[si + 2]; out[di + 3] = 255; }
      else if (colorType === 3) { const pi = line[si] * 3; out[di] = palette[pi]; out[di + 1] = palette[pi + 1]; out[di + 2] = palette[pi + 2]; out[di + 3] = trns && line[si] < trns.length ? trns[line[si]] : 255; }
      else { out[di] = out[di + 1] = out[di + 2] = line[si]; out[di + 3] = 255; }
    }
    prev = line;
  }
  return { width, height, data: out };
}

/**
 * Separates the drawn doll from the flat background. `threshold` is the summed RGB difference
 * from the most common colour; the default ignores the faint dust specks.
 */
export function analyse(file, { threshold = 60, components = true } = {}) {
  const { width, height, data } = decodePng(readFileSync(file));
  const counts = new Map();
  for (let i = 0; i < width * height; i++) {
    const key = (data[i * 4] >> 3 << 10) | (data[i * 4 + 1] >> 3 << 5) | (data[i * 4 + 2] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bgKey = 0, bgCount = -1;
  for (const [k, n] of counts) if (n > bgCount) { bgCount = n; bgKey = k; }
  const br = ((bgKey >> 10) & 31) << 3, bgg = ((bgKey >> 5) & 31) << 3, bb = (bgKey & 31) << 3;

  const mask = new Uint8Array(width * height);
  let pixels = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bgg) + Math.abs(data[i + 2] - bb);
      if (d > threshold) {
        mask[y * width + x] = 1; pixels++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (pixels === 0) return { width, height, pixels: 0, bbox: null, centroid: null, components: 0, mask, largest: 0 };

  let comps = 0;
  let largest = 0;
  if (components) {
    const label = new Int32Array(width * height);
    const stack = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || label[s]) continue;
      comps++;
      let size = 0;
      stack.push(s);
      label[s] = comps;
      while (stack.length) {
        const q = stack.pop();
        size++;
        const qx = q % width, qy = (q - qx) / width;
        if (qx > 0 && mask[q - 1] && !label[q - 1]) { label[q - 1] = comps; stack.push(q - 1); }
        if (qx < width - 1 && mask[q + 1] && !label[q + 1]) { label[q + 1] = comps; stack.push(q + 1); }
        if (qy > 0 && mask[q - width] && !label[q - width]) { label[q - width] = comps; stack.push(q - width); }
        if (qy < height - 1 && mask[q + width] && !label[q + width]) { label[q + width] = comps; stack.push(q + width); }
      }
      largest = Math.max(largest, size);
    }
  }
  return {
    width,
    height,
    pixels,
    bbox: { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    centroid: { x: sx / pixels, y: sy / pixels },
    components: comps,
    largest,
    mask,
  };
}

const RAMP = ' .:-=+*#%@';

/** Coarse silhouette preview: `cols` characters wide, cropped to the foreground. */
export function asciiArt(stats, cols = 56) {
  if (!stats.bbox) return ['(empty)'];
  const { mask, width, bbox } = stats;
  const w = Math.min(cols, bbox.w);
  const h = Math.max(1, Math.round((bbox.h / bbox.w) * w * 0.5));
  const lines = [];
  for (let ry = 0; ry < h; ry++) {
    let line = '';
    for (let rx = 0; rx < w; rx++) {
      const px0 = bbox.x0 + Math.floor((rx * bbox.w) / w);
      const px1 = Math.max(px0 + 1, bbox.x0 + Math.floor(((rx + 1) * bbox.w) / w));
      const py0 = bbox.y0 + Math.floor((ry * bbox.h) / h);
      const py1 = Math.max(py0 + 1, bbox.y0 + Math.floor(((ry + 1) * bbox.h) / h));
      let hit = 0, total = 0;
      for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) { total++; if (mask[y * width + x]) hit++; }
      const f = hit / Math.max(1, total);
      line += f < 0.08 ? ' ' : f < 0.3 ? '.' : f < 0.6 ? '+' : f < 0.85 ? '#' : '@';
    }
    lines.push(line);
  }
  void RAMP;
  return lines;
}
