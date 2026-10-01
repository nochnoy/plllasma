/**
 * The player, as the site knows them.
 *
 * The game has no players of its own any more: whoever is playing is signed
 * into the site the game lives on (`plllasma.ru`), and the page's first act is
 * to hand the session's own token to the game's server and wait, on a black
 * screen, for the player the site says owns it (`POST /api/auth` in
 * `chat/api.ts`). What comes back is this: the id the whole site knows them by,
 * the nickname they are called there, and the name of their userpic — the file
 * the site keeps at `/i/<icon>.gif`, read as an origin-absolute path because
 * the game lives under the same site as the folder does
 * (`userpic` in `chat/messages.ts`).
 */
export interface User {
  /** The site's own id for the player (`userId` as `api/user-by-token.php` answers it). */
  id: number;
  nick: string;
  /** The userpic's own name, '-' for a player with none — the file exists either way. */
  icon: string;
}

/** The cookie the site's login leaves: `contortion_key`, the session's own token (`logkey`). */
export const TOKEN_COOKIE = 'contortion_key';

/**
 * The token this page plays under, from wherever it can be had.
 *
 * The cookie is the real answer — the page is served from the site itself, and
 * a signed-in player has the cookie already (it is not HttpOnly, which the site
 * set it without in 2007 and this page is the beneficiary of). A `?token=`
 * in the address is the way in where there is no site to be signed into: a
 * development server, or a link handed to a session. A build told a token
 * (`VITE_TOKEN`) is the last resort, for a page that knows exactly one player.
 */
export function siteToken(): string {
  // A page has a document and an address; anything else — a test's node, say — has neither, and its
  // answer is the last resort: nothing, unless the build was told a token outright.
  if (typeof document !== 'undefined') {
    const baked = document.cookie.split('; ').find((row) => row.startsWith(`${TOKEN_COOKIE}=`));
    if (baked) return baked.slice(TOKEN_COOKIE.length + 1);
  }
  if (typeof window !== 'undefined') {
    const handed = new URLSearchParams(window.location.search).get('token');
    if (handed) return handed;
  }
  const told: string | undefined = import.meta.env.VITE_TOKEN;
  return told ?? '';
}
