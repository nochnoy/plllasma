import { describe, expect, it } from 'vitest';
import {
  CharacterStore,
  DEFAULT_CHARACTER,
  PORTRAIT_COUNT,
  PORTRAIT_HEIGHT,
  PORTRAIT_SETS,
  PORTRAIT_WIDTH,
  REST_PORTRAIT,
  partUrl,
  pickPortrait,
  portraitUrl,
  restPortraitUrl,
} from '../src/game/characters';
import { PART_ASSETS } from '../src/game/parts.generated';
import { World } from '../src/game/world';

/**
 * A character is a look, not a rig: the game has the movie's one rig and one set of pivots, and what
 * a character brings to it is the artwork of a folder — `assets/characters/<folder>/parts/*.png` and
 * `assets/characters/<folder>/portrait/<n>-<set>.png`. These are the rules that follow from that: the
 * paths are the folder's, a doll carries the character it was added with, and the list the popup shows
 * starts with the one character the game has.
 */

describe('character artwork', () => {
  it('reads the parts and the portraits out of the character folder', () => {
    expect(partUrl(DEFAULT_CHARACTER, PART_ASSETS.head.file)).toBe(
      '/assets/characters/elena/parts/head.png',
    );
    expect(portraitUrl(DEFAULT_CHARACTER, 0, 1)).toBe('/assets/characters/elena/portrait/0-1.png');
    // A character that wears someone else's sprite set reads those files, not its own id's: that is
    // what the folder is for, and it is how a character made on this device is dressed.
    const copy = { id: 'local-1', name: 'Маша', folder: 'elena' };
    expect(partUrl(copy, 'arm.png')).toBe('/assets/characters/elena/parts/arm.png');
    // The base is the page's, so a build dropped into a sub-directory reads its own assets.
    expect(portraitUrl(DEFAULT_CHARACTER, 0, 2, './')).toBe(
      './assets/characters/elena/portrait/0-2.png',
    );
  });

  it('names the eight portraits, their sets and their size', () => {
    expect(PORTRAIT_COUNT).toBe(8);
    expect(PORTRAIT_SETS).toBe(3);
    expect(portraitUrl(DEFAULT_CHARACTER, PORTRAIT_COUNT - 1, 3)).toBe(
      '/assets/characters/elena/portrait/7-3.png',
    );
    expect([PORTRAIT_WIDTH, PORTRAIT_HEIGHT]).toEqual([120, 120]);
    // The breather is the ninth picture and the only one with a name instead of a number: the count
    // above is the ladder's own length, not how many files a character may bring (see `pain-state.ts`).
    expect(REST_PORTRAIT).toBe('rest');
    expect(restPortraitUrl(DEFAULT_CHARACTER, 2)).toBe(
      '/assets/characters/elena/portrait/rest-2.png',
    );
    expect(restPortraitUrl(DEFAULT_CHARACTER, 1, './')).toBe(
      './assets/characters/elena/portrait/rest-1.png',
    );
  });

  it('keeps the part file names bare, so any character folder can hold them', () => {
    for (const asset of Object.values(PART_ASSETS)) expect(asset.file).toMatch(/^[a-z]+\.png$/);
  });

  it('is the folder the baking tool writes', () => {
    // `tools/prepare-assets.mjs` bakes the parts into `assets/characters/elena/parts` and cannot
    // import this module (it is TypeScript, the tool is not), so the agreement is checked here.
    expect(DEFAULT_CHARACTER.id).toBe('elena');
    expect(DEFAULT_CHARACTER.folder).toBe('elena');
  });
});

describe('the portrait matrix', () => {
  it('takes the picture of the face and the set asked for', () => {
    const pictures = [
      ['a1', 'a2', 'a3'],
      ['b1', 'b2', 'b3'],
    ];
    expect(pickPortrait(pictures, 1, 2)).toEqual({ face: 1, set: 2, picture: 'b2' });
    expect(pickPortrait(pictures, 0, 1)).toEqual({ face: 0, set: 1, picture: 'a1' });
  });

  it('cascades down the sets when the artwork brought no such one', () => {
    // The elena artwork itself is shaped like this: the fifth face has no `-2`, the sixth and the
    // seventh have neither `-2` nor `-3`, and what the card wears is the set before the missing one.
    const pictures = [
      ['0-1', '0-2', '0-3'],
      ['1-1', null, '1-3'],
      ['2-1', null, null],
    ];
    expect(pickPortrait(pictures, 1, 2)).toEqual({ face: 1, set: 1, picture: '1-1' });
    expect(pickPortrait(pictures, 1, 3)).toEqual({ face: 1, set: 3, picture: '1-3' });
    expect(pickPortrait(pictures, 2, 3)).toEqual({ face: 2, set: 1, picture: '2-1' });
    expect(pickPortrait(pictures, 2, 2)).toEqual({ face: 2, set: 1, picture: '2-1' });
  });

  it('falls to the worst face below a hole, and only then to the nearest above', () => {
    const pictures = [
      ['0-1', null, null],
      [null, null, null],
      ['2-1', '2-2', '2-3'],
    ];
    // A face missing from every set is a hole in the pain scale: the card understates rather than
    // overstates, so the first face stands in for the missing second one...
    expect(pickPortrait(pictures, 1, 2)).toEqual({ face: 0, set: 1, picture: '0-1' });
    // ...and only with nothing below does it take the face above.
    const upsideDown = [[null, null, null], ['1-1', '1-2', '1-3']];
    expect(pickPortrait(upsideDown, 0, 3)).toEqual({ face: 1, set: 3, picture: '1-3' });
  });

  it('has nothing to show for an artwork that brought nothing', () => {
    expect(pickPortrait([[], []], 1, 1)).toBeNull();
    expect(pickPortrait([], 0, 1)).toBeNull();
  });
});

describe('character list', () => {
  it('starts with the one character the game has', () => {
    const store = new CharacterStore();
    expect(store.characters).toHaveLength(1);
    expect(store.characters[0]).toBe(DEFAULT_CHARACTER);
    expect(DEFAULT_CHARACTER.name).toBe('Елена');
  });

  it('adds a copy of the default character under a name of its own', () => {
    const store = new CharacterStore();
    const created = store.create('  Маша  ');
    expect(created.name).toBe('Маша');
    // No artwork to go with the name yet, so she wears the default character's.
    expect(created.folder).toBe(DEFAULT_CHARACTER.folder);
    expect(store.characters).toHaveLength(2);
    expect(store.characters[1]).toBe(created);
  });

  it('gives every character made on this device an id of its own', () => {
    const store = new CharacterStore();
    const first = store.create('Первая');
    const second = store.create('Вторая');
    expect(new Set([DEFAULT_CHARACTER.id, first.id, second.id]).size).toBe(3);
  });

  it('falls back to the default name when there is none', () => {
    const store = new CharacterStore();
    expect(store.create('   ').name).toBe(DEFAULT_CHARACTER.name);
  });
});

describe('dressing a doll', () => {
  it('puts the default character on the stage when none was named', () => {
    const world = new World();
    expect(world.addDoll({ x: 0, y: 0 })?.character).toBe(DEFAULT_CHARACTER);
  });

  it('keeps the character a doll was added with', () => {
    const world = new World();
    const created = new CharacterStore().create('Маша');
    expect(world.addDoll({ x: 120, y: -60 }, created)?.character).toBe(created);
    world.addDoll({ x: -120, y: -60 });
    // Two dolls, two characters — and one rig either way: it is only the artwork that differs.
    expect(world.dolls.map((doll) => doll.character.name)).toEqual(['Маша', 'Елена']);
    expect(world.dolls[0].particles).toHaveLength(world.dolls[1].particles.length);
  });
});
