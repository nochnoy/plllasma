/**
 * The characters that can be put on the stage.
 *
 * A character is a *look*, not a rig. Every character shares the pivots, the tile size and the seven
 * body parts the baking tool wrote into `parts.generated.ts` — the rig is the same for all of them,
 * and only the artwork differs. So a character is little more than the folder its sprites are read
 * from: `public/assets/characters/<folder>/parts/*.png` for the body and
 * `public/assets/characters/<folder>/portrait/<n>.png` for the portraits.
 *
 * The list of characters belongs on a back end, and this module is where it will arrive: today
 * nothing is stored anywhere but in memory (see {@link CharacterStore}), and the game starts with the
 * single character the artwork from the original movie belongs to.
 *
 * A character's portraits are its own art — eight pictures, one per step of pain the pose is worth
 * (see `pain.ts`) — and they arrive as files rather than being baked from the movie, which never
 * had a face of its own: `portrait/0-1.png` is the calm face and `portrait/7-1.png` the worst. A
 * ninth one, {@link REST_PORTRAIT}, is not a step of that scale at all and is named instead of
 * numbered.
 *
 * Every picture comes in up to three *sets*, `-1`, `-2` and `-3`: the first is the face as the
 * artwork drew it, the second is what she looks like once the machine behind the card has put her
 * through something extreme enough to wear the breather (`FACE.rest`), and the third is the
 * enlightenment — the seventh portrait, `7-1.png`, worn for two sources past their limits at once
 * (`FACE.super`), which outweighs everything the second set says (see `pain-state.ts`). A set a
 * character did not bring is not a hole: the card falls back on the set before it, and the one
 * before that, all the way down to the first — the *cascade* {@link pickPortrait} walks — so an
 * artwork of one set only is a complete artwork.
 */
export interface Character {
  /** Identity of the character; for one that owns its artwork, also the folder it lives in. */
  readonly id: string;
  /** What the player reads in the character list. */
  readonly name: string;
  /**
   * Folder under `assets/characters` the sprites and the portraits are read from.
   *
   * It is separate from {@link id} because a character made on this device borrows another one's
   * artwork: there is nowhere to upload sprites to yet, so a new character is a copy of the default
   * one — its own name and id, the default's folder (see `CharacterStore.create`).
   */
  readonly folder: string;
}

/** How many portraits every character has: one per step of pain, `portrait/0-<set>.png` .. `portrait/7-<set>.png`. */
export const PORTRAIT_COUNT = 8;
/**
 * How many sets of them a character may bring: the plain faces, the ones after something extreme,
 * and the enlightenment's own (see the module comment). Every set after the first is optional —
 * {@link pickPortrait} cascades down to the one before it — so `1` is a complete answer too.
 */
export const PORTRAIT_SETS = 3;
/**
 * The one portrait that is not a step of pain: `portrait/rest-<set>.png`, the face a doll wears when
 * the pose has stopped hurting but she has not — a breather after something extreme (see `FACE.rest`
 * in `pain-state.ts`). It sits next to the numbered ones and is named rather than numbered because
 * nothing measures it: it is a state of the machine, not a degree of anything.
 */
export const REST_PORTRAIT = 'rest';
/** Size of every portrait, in pixels: the shape the strip of cards draws them in. */
export const PORTRAIT_WIDTH = 120;
export const PORTRAIT_HEIGHT = 120;

/** The character the game starts with: the one baked from the original movie's artwork. */
export const DEFAULT_CHARACTER: Character = { id: 'elena', name: 'Елена', folder: 'elena' };

/** Where the artwork of one body part of a character lives. `file` is a `PartAsset.file`. */
export function partUrl(character: Character, file: string, base = '/'): string {
  return `${base}assets/characters/${character.folder}/parts/${file}`;
}

/**
 * Where one of a character's portraits lives, `index` being the step of pain and `set` one of the
 * three a character may bring (see the module comment): 0-1 is the one the character list shows,
 * and 7-1 is the worst face the art has.
 */
export function portraitUrl(character: Character, index: number, set = 1, base = '/'): string {
  return `${base}assets/characters/${character.folder}/portrait/${index}-${set}.png`;
}

/**
 * Where the character's breather lives, `portrait/rest-<set>.png` — see {@link REST_PORTRAIT}. A
 * character that has none of its own is not left without a face: the card falls back on the numbered
 * picture that means the same thing ("nothing hurts now, but something did a moment ago").
 */
export function restPortraitUrl(character: Character, set = 1, base = '/'): string {
  return `${base}assets/characters/${character.folder}/portrait/${REST_PORTRAIT}-${set}.png`;
}

/**
 * The picture a card draws from a character's portrait matrix: the one at `face` and `set`, or the
 * nearest one the artwork actually has.
 *
 * Two kinds of nearness, in the order they are asked for. The *set* first: a set the character did
 * not bring is fallen back on the set before it, and the one before that, down to the first — so
 * `5-2` missing is `5-1`, and `7-3` missing is `7-1`, because the artwork brought neither `-2` nor
 * `-3` of that face. Then the *face*: a numbered picture missing from every set is a hole in the
 * middle of the pain scale, and the card keeps the worst face below it — a pose that asks for a
 * picture nobody has still reads as the worst face there is — and only when there is nothing below
 * does it take the nearest face above, so a card may understate a pose, never overstate it.
 *
 * `pictures` is the matrix as the scene loads it: one row per numbered face, each holding the sets
 * in their own order, with `null` for a file the artwork did not bring. The rest portrait is not in
 * it — it is named rather than numbered, and the caller holds it apart.
 */
export function pickPortrait<T>(
  pictures: readonly (readonly (T | null)[])[],
  face: number,
  set: number,
): { face: number; set: number; picture: T } | null {
  const worn = (at: number): { face: number; set: number; picture: T } | null => {
    for (let s = Math.min(set, pictures[at]?.length ?? 0); s >= 1; s--) {
      const picture = pictures[at]?.[s - 1];
      if (picture) return { face: at, set: s, picture };
    }
    return null;
  };
  for (let at = Math.min(face, pictures.length - 1); at >= 0; at--) {
    const found = worn(at);
    if (found) return found;
  }
  for (let at = face + 1; at < pictures.length; at++) {
    const found = worn(at);
    if (found) return found;
  }
  return null;
}

/**
 * The characters the player can choose from.
 *
 * A back end is the natural home for this list — it is the one thing in the game that is not derived
 * from the movie or from the player's own actions — so the class is deliberately nothing but a list
 * with a `create` in front of it, and {@link characters} is what the popup renders.
 */
export class CharacterStore {
  private readonly list: Character[] = [DEFAULT_CHARACTER];
  /** Counts the characters made on this device, so their ids do not collide with each other. */
  private created = 0;

  /** The list, in the order the popup shows it: the default one first, newest last. */
  get characters(): readonly Character[] {
    return this.list;
  }

  /**
   * A new character: for now a copy of the default one under a name of its own — the same sprites,
   * the same portraits, the same pivots — since there is no artwork to go with a name yet. It gets an
   * id of its own so the list can tell the copies apart, and is added to the end of the list, which is
   * all the popup's own "+" does.
   */
  create(name: string): Character {
    const character: Character = {
      id: `local-${++this.created}`,
      name: name.trim() || DEFAULT_CHARACTER.name,
      folder: DEFAULT_CHARACTER.folder,
    };
    this.list.push(character);
    return character;
  }
}
