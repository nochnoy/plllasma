import type { PartAsset } from './parts.generated';

/**
 * The alpha of one baked part: one byte per texel of its PNG.
 *
 * Every part is baked into the same tile with its pivot in the middle (see
 * `tools/prepare-assets.mjs` and docs/assets.md), so most of the quad a part occupies is transparent
 * padding. The renderer decodes these masks once, from the same canvas it uploads as a texture, and
 * hands them to the world: a click that lands on a texel the artwork does not cover must not count
 * as a click on that part — otherwise a rope could be tied to her hip from the empty corner beside
 * it, or pinned to her by a drop on the bare stage at her feet.
 */
export interface PartMask {
  readonly width: number;
  readonly height: number;
  /** Alpha of every texel, row by row: 0 means the texel is fully transparent. */
  readonly alpha: Uint8Array;
}

/** The masks the renderer has decoded. Parts are missing until their textures have loaded. */
export type PartMasks = Partial<Record<string, PartMask>>;

/**
 * Whether the artwork covers a point of a part's own quad.
 *
 * `along` and `across` are world pixels from the bone's midpoint in the part's own frame — the frame
 * {@link Doll.hitTest} measures in, and the frame the sprite is drawn in: its anchor is the pivot and
 * its local +X runs along the bone.
 */
export function maskCovers(mask: PartMask, asset: PartAsset, along: number, across: number): boolean {
  const x = Math.floor(asset.pivotX + along / asset.unitsPerTexel);
  const y = Math.floor(asset.pivotY + across / asset.unitsPerTexel);
  return maskAlphaAt(mask, x, y) > 0;
}

/** The alpha of one texel of a mask, or 0 when the texel is outside the tile altogether. */
export function maskAlphaAt(mask: PartMask, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return 0;
  return mask.alpha[y * mask.width + x];
}

/** The alpha of a decoded PNG, one byte per texel: what a mask is made of. */
export function maskFromImageData(image: ImageData): PartMask {
  const alpha = new Uint8Array(image.width * image.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3];
  return { width: image.width, height: image.height, alpha };
}

