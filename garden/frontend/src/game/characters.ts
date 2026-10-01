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
 * (see `pain.ts`) — and they arrive as eight files rather than being baked from the movie, which
 * never had a face of its own: `portrait/0.png` is the calm face and `portrait/7.png` the worst. A
 * ninth one, {@link REST_PORTRAIT}, is not a step of that scale at all and is named instead of numbered.
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

/** How many portraits every character has: one per step of pain, `portrait/0.png` .. `portrait/7.png`. */
export const PORTRAIT_COUNT = 8;
/**
 * The one portrait that is not a step of pain: `portrait/rest.png`, the face a doll wears when the pose
 * has stopped hurting but she has not — a breather after something extreme (see `FACE.rest` in
 * `pain-state.ts`). It sits next to the numbered ones and is named rather than numbered because nothing
 * measures it: it is a state of the machine, not a degree of anything.
 */
export const REST_PORTRAIT = 'rest';
/** Size of every portrait, in pixels: the shape the character list draws them in. */
export const PORTRAIT_WIDTH = 120;
export const PORTRAIT_HEIGHT = 180;

/** The character the game starts with: the one baked from the original movie's artwork. */
export const DEFAULT_CHARACTER: Character = { id: 'elena', name: 'Елена', folder: 'elena' };

/** Where the artwork of one body part of a character lives. `file` is a `PartAsset.file`. */
export function partUrl(character: Character, file: string, base = '/'): string {
  return `${base}assets/characters/${character.folder}/parts/${file}`;
}

/**
 * Where one of a character's portraits lives, `index` being the step of pain: 0 is the one the
 * character list shows, and the last is the worst face the art has.
 */
export function portraitUrl(character: Character, index: number, base = '/'): string {
  return `${base}assets/characters/${character.folder}/portrait/${index}.png`;
}

/**
 * Where the character's breather lives, `portrait/rest.png` — see {@link REST_PORTRAIT}. A character that
 * has none of its own is not left without a face: the card falls back on the numbered picture that means
 * the same thing ("nothing hurts now, but something did a moment ago").
 */
export function restPortraitUrl(character: Character, base = '/'): string {
  return `${base}assets/characters/${character.folder}/portrait/${REST_PORTRAIT}.png`;
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
