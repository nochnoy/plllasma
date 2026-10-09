import { describe, expect, it } from 'vitest';
import {
  CharacterStore,
  DEFAULT_CHARACTER,
  PORTRAIT_COUNT,
  PORTRAIT_HEIGHT,
  PORTRAIT_WIDTH,
  REST_PORTRAIT,
  partUrl,
  portraitUrl,
  restPortraitUrl,
} from '../src/game/characters';
import { PART_ASSETS } from '../src/game/parts.generated';
import { World } from '../src/game/world';

/**
 * A character is a look, not a rig: the game has the movie's one rig and one set of pivots, and what
 * a character brings to it is the artwork of a folder — `assets/characters/<folder>/parts/*.png` and
 * `assets/characters/<folder>/portrait/<n>.png`. These are the rules that follow from that: the paths
 * are the folder's, a doll carries the character it was added with, and the list the popup shows
 * starts with the one character the game has.
 */

describe('character artwork', () => {
  it('reads the parts and the portraits out of the character folder', () => {
    expect(partUrl(DEFAULT_CHARACTER, PART_ASSETS.head.file)).toBe(
      '/assets/characters/elena/parts/head.png',
    );
    expect(portraitUrl(DEFAULT_CHARACTER, 0)).toBe('/assets/characters/elena/portrait/0.png');
    // A character that wears someone else's sprite set reads those files, not its own id's: that is
    // what the folder is for, and it is how a character made on this device is dressed.
    const copy = { id: 'local-1', name: 'Маша', folder: 'elena' };
    expect(partUrl(copy, 'arm.png')).toBe('/assets/characters/elena/parts/arm.png');
    // The base is the page's, so a build dropped into a sub-directory reads its own assets.
    expect(portraitUrl(DEFAULT_CHARACTER, 0, './')).toBe('./assets/characters/elena/portrait/0.png');
  });

  it('names the eight portraits and their size', () => {
    expect(PORTRAIT_COUNT).toBe(8);
    expect(portraitUrl(DEFAULT_CHARACTER, PORTRAIT_COUNT - 1)).toBe(
      '/assets/characters/elena/portrait/7.png',
    );
    expect([PORTRAIT_WIDTH, PORTRAIT_HEIGHT]).toEqual([220, 220]);
    // The breather is the ninth picture and the only one with a name instead of a number: the count
    // above is the ladder's own length, not how many files a character may bring (see `pain-state.ts`).
    expect(REST_PORTRAIT).toBe('rest');
    expect(restPortraitUrl(DEFAULT_CHARACTER)).toBe('/assets/characters/elena/portrait/rest.png');
    expect(restPortraitUrl(DEFAULT_CHARACTER, './')).toBe('./assets/characters/elena/portrait/rest.png');
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
