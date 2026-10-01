import { describe, expect, it } from 'vitest';
import { Doll } from '../src/game/doll';
import { maskAlphaAt, maskCovers, type PartMask, type PartMasks } from '../src/game/part-mask';
import { PART_ASSETS, type PartName } from '../src/game/parts.generated';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../src/game/stage';
import { PEngine2D } from '../src/game/vm/engine';

/**
 * Picking a body part is the port's own job — the original movie had nothing to click, so nothing in
 * the SWF says how a click chooses a part. What can be checked is the rule the port promises: a click
 * picks a part by its artwork box, and then only where the artwork actually is, because every part
 * is baked into a uniform tile whose corners are transparent padding (see docs/assets.md).
 */

/** A mask that is opaque inside a box and transparent everywhere else. */
function boxMask(size: number, box: { minX: number; minY: number; maxX: number; maxY: number }): PartMask {
  const alpha = new Uint8Array(size * size);
  for (let y = Math.max(0, box.minY); y <= box.maxY; y++) {
    for (let x = Math.max(0, box.minX); x <= box.maxX; x++) alpha[y * size + x] = 255;
  }
  return { width: size, height: size, alpha };
}

/** A mask for every part of the rig, all built the same way. */
function everyPart(build: (asset: (typeof PART_ASSETS)[PartName]) => PartMask): PartMasks {
  const masks: PartMasks = {};
  for (const [name, asset] of Object.entries(PART_ASSETS)) masks[name] = build(asset);
  return masks;
}

/** An all-transparent mask, i.e. artwork nowhere. */
const empty = (asset: (typeof PART_ASSETS)[PartName]): PartMask =>
  boxMask(asset.width, { minX: 0, minY: 0, maxX: -1, maxY: -1 });

/** An all-opaque mask, i.e. artwork everywhere in the tile. */
const solid = (asset: (typeof PART_ASSETS)[PartName]): PartMask =>
  boxMask(asset.width, { minX: 0, minY: 0, maxX: asset.width - 1, maxY: asset.height - 1 });

describe('part masks', () => {
  it('treats texels outside the tile as transparent', () => {
    const mask = boxMask(8, { minX: 0, minY: 0, maxX: 7, maxY: 7 });
    expect(maskAlphaAt(mask, 3, 3)).toBe(255);
    expect(maskAlphaAt(mask, -1, 3)).toBe(0);
    expect(maskAlphaAt(mask, 8, 3)).toBe(0);
    expect(maskAlphaAt(mask, 3, 8)).toBe(0);
  });

  it('reads a point of the part frame as a texel of the tile', () => {
    const asset = PART_ASSETS.thigh;
    const mask = boxMask(asset.width, {
      minX: asset.pivotX,
      minY: asset.pivotY,
      maxX: asset.pivotX,
      maxY: asset.pivotY,
    });
    // The pivot is the origin of the frame, so a point with no offset at all lands on it.
    expect(maskCovers(mask, asset, 0, 0)).toBe(true);
    // And one texel away, in world pixels, is a texel away in the tile.
    expect(maskCovers(mask, asset, asset.unitsPerTexel, 0)).toBe(false);
    expect(maskCovers(mask, asset, 0, -asset.unitsPerTexel)).toBe(false);
  });
});

describe('doll picking', () => {
  /** A doll in an engine, and the middle of a bone — a point inside that part's own box. */
  function rig(): { doll: Doll; point: { x: number; y: number } } {
    const doll = Doll.spawn(new PEngine2D(STAGE_WIDTH, STAGE_HEIGHT));
    if (!doll) throw new Error('the engine refused a doll');
    const part = doll.skin.find((candidate) => candidate.mc === 'thigh');
    if (!part) throw new Error('no thigh in the skin table');
    return { doll, point: { x: (part.p1.x + part.p2.x) / 2, y: (part.p1.y + part.p2.y) / 2 } };
  }

  it('picks a part from the box when no masks are known', () => {
    const { doll, point } = rig();
    expect(doll.hitTest(point.x, point.y)).not.toBeNull();
  });

  it('keeps its answer when the artwork covers the point', () => {
    const { doll, point } = rig();
    expect(doll.hitTest(point.x, point.y, everyPart(solid))?.mc).toBe(doll.hitTest(point.x, point.y)?.mc);
  });

  it('refuses a click that lands on fully transparent padding', () => {
    const { doll, point } = rig();
    expect(doll.hitTest(point.x, point.y, everyPart(empty))).toBeNull();
  });

  it('falls through to the part whose artwork is really there', () => {
    const { doll, point } = rig();
    const masks = everyPart(empty);
    const thigh = PART_ASSETS.thigh;
    // Only the thigh has any artwork at all, and only at its own pivot — which is where the middle
    // of its bone lands. Whatever else covers this point, the answer has to be the thigh.
    masks.thigh = boxMask(thigh.width, {
      minX: thigh.pivotX,
      minY: thigh.pivotY,
      maxX: thigh.pivotX,
      maxY: thigh.pivotY,
    });
    expect(doll.hitTest(point.x, point.y, masks)?.mc).toBe('thigh');
  });
});
