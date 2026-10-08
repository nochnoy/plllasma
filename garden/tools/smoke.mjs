// Headless smoke test for the built game.
//
// Boots frontend/dist/ in Chromium (software WebGL), drives the real pointer and keyboard, and writes
// screenshots plus a machine-readable summary. Inspect the screenshots with tools/look.mjs,
// which prints a silhouette and component count as text.
//
// The run also covers the toolbar, which is real DOM: it picks the rope from the bar, draws one on the
// doll, carries one of its knots about, puts two more dolls on the stage through the engine's own
// calls, and takes the rope off it again with a press on the middle of its cord, which bursts the rope
// where it stood. A run of the world is written down and played
// back too (`tape.ts`), which is where the promise that a tape *is* the run is measured: the run is
// the rows of every joint and every card, quarter-pixel for quarter-pixel, and a playback is those
// rows put back — no simulation in it, and nothing to drift. It exits non-zero if any of that
// — or the rope's 5% stretch budget, the opening's own claims (she is lying on the floor from the first
// frame, at rest, with her shadow at full strength and a calm card), the rule that a tool is the
// player's to keep, the interface having to sit *inside* the world (the bar
// at the world's left edge — its three buttons hanging from the world's own top, the chat's own button the
// last of them — the chat's strip under that stack against the same left edge and the strip of portraits in the bottom right corner of it, or
// in its top right one when the window is taller than it is wide, at
// whatever size the window makes the world), the page being black around it, the icon the page hands the
// browser for its own tab, the chat's own four lines and
// the screen they open — the garden's first location the player lands on and pans through to the stage,
// the list of runs in that screen's right-hand column, and the run a press on one
// of its rows plays — the walls
// having to stand `WALL_MARGIN_X`/`Y` world pixels inside the world with the doll ending up on their
// floor rather than the picture's, or a card having to follow the pose the doll is in — did not hold.
//
// The game's own obstacle is in the run as well: she is flung up at the ceiling that stands
// `CEILING_MARGIN` (200 world pixels) above the picture, is stopped by it rather than lost, and
// comes back down.
//
// Requires `npm i --no-save puppeteer @ruffle-rs/ruffle` and a prior `npm run build`.
// Usage: node tools/smoke.mjs [outDir]
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, normalize, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { decodePng } from './png.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outDir = process.argv[2] ?? join(root, 'tmp-smoke');
mkdirSync(outDir, { recursive: true });

/*
 * The chat's side of the wire, in this process.
 *
 * The built game's chat reads the log of the place it is in from a server (`src/chat/api.ts`, whose other
 * end is the Go server in `backend/`), and a smoke run has no backend: the server below hands the browser the
 * files of the build and nothing else. So the doors the chat goes through are answered here: the log of a
 * place and the line written into it, out of a log written down in this file — six messages in the lobby,
 * one of them holding a gif — and the three doors the window's own list of runs goes through, which read
 * `chatRuns`, `chatTapes` and `foreignRun` below. Both lists are empty until the tape section at the foot of
 * this run has recorded a run: the tape a row hands over is that run's own file, and a tape invented here would
 * be a second reading of the format rather than the game's. `foreignRun` is one run out of that same file,
 * served as somebody else's and still being played, which is what the watching section at the foot reads.
 *
 * What this run is about is the interface: where the strip stands, what a line is made of, and that a row
 * of the list plays the run it names. Six messages answer all of that as well as a conversation with
 * anybody would, and how the store itself behaves is the Go tests' question rather than this one's.
 *
 * The shapes are the store's own, omissions and all: a lobby line has no `tape` at all, an unanchored one
 * has no `at_step`, and a run that has stopped carries no `live`.
 */
const CHAT_MS = 1_700_000_000_000;

/** A run of text in a body: the whole of what the player's own field writes. */
const said = (text) => ({ kind: 'text', text });

/** A gif standing in a body. A path rather than a name, because a body is written by a player. */
const drew = (file, alt) => ({ kind: 'gif', file: `assets/chat/${file}`, alt });

/**
 * The one player this smoke is: the site's answer about the token this page would carry. The page has no
 * token of its own here — no site to be signed into — so the handshake door below answers for whoever
 * asks, and this is who: the name and the userpic every line this run sends is signed by.
 */
const player = { id: 2, nick: 'Марат', icon: '2' };

/** One line of the lobby, by one of its own: the site's id for them, and the name of their userpic. */
function lobbyLine(id, userId, nick, icon, parts) {
  return {
    id,
    user_id: userId,
    nick,
    icon,
    ghost: false,
    parts,
    sent_ms: CHAT_MS + id * 60_000,
  };
}

const chatLog = [
  lobbyLine(1, 9, 'Марго', '9', [said('она полезла на самый верх')]),
  lobbyLine(2, 4, 'Костя', '14', [said('и без страховки, конечно')]),
  lobbyLine(3, 7, 'Аня', '15', [said('вот это сальто'), drew('laugh.gif', 'смешно')]),
  lobbyLine(4, 9, 'Марго', '9', [said('держитесь, я записываю')]),
  lobbyLine(5, 4, 'Костя', '14', [said('пятнадцать шагов и всё')]),
  lobbyLine(6, 7, 'Аня', '15', [said('кто на сцене?')]),
];

/** What the doors have been asked: the run's own record of it, read again by the report at the foot. */
const chatAsked = { sent: [], tapes: [] };

/**
 * The runs that arrived as they were *played*: the head each one was opened with, and the slices that followed
 * it (`LiveWire` in `frontend/src/live/api.ts`).
 *
 * This is where the recording side of the page is checked from — a run that begins by itself and arrives a
 * second at a time — and it is what the server's own two recording doors answer. Watching a run while it is
 * being played is the other half of the same wire, and it is checked at the foot of this file too: the run the
 * door there serves is this page's own recorded run, cut into slices of a second (`foreignRun`, `sliced`).
 */
const chatLive = { opened: [], refused: [] };

/**
 * The runs the list beside the conversation is drawn from, and the tapes those runs are asked for by id.
 *
 * Both are filled in once there is a tape to serve (`tapeFile`, at the foot of the tape's own section): the
 * list is a handful of numbers about a run rather than the run itself, so a row can be drawn from a line of
 * JSON, while the tape behind it is the game's own file — served byte for byte, the way the server does.
 */
const chatRuns = [];
const chatTapes = new Map();

/**
 * The one run this smoke serves as a run that is *still being played*: a head and the slices of the run this
 * page has itself recorded, handed out as somebody else's, a second of it at a time — so that a window which
 * watches it has a run that really does grow under it.
 *
 * It is set up by the section that watches it, at the foot of this file, and it is `null` until then: the door
 * below is answered for this run and for no other, so a page that asked about some other run that is still
 * being played would be reading a run out of the air.
 */
let foreignRun = null;

/** One past the last id in the log: what the next line taken down is numbered. */
let chatNext = chatLog.length + 1;

/**
 * The rows of the runs this server knows, by id: what a run's own line in the chat is drawn from — its
 * words (`label`), the line it is bound to (`message`) and whether it is still being played (`live`). The
 * real store keeps the same row in its own table (`store.Recording`); this door keeps it here, written by
 * the opening of a run and by the door that says its words, and read by the asking the chat makes with
 * (`?ids=` below).
 */
const chatRows = new Map();

/** The words said through the run's own door: what the page asked its run's line to say, in order. */
const chatSaid = [];

/** The body of a request, as JSON, or nothing at all when it held none. */
async function chatBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * One of the chat's three doors, answered.
 *
 * while the heart is a question of its own — and the visitor who left one finds it in `mine`. The window
 * guesses the same thing the moment a button is pressed (`messages.ts`) and takes this answer as the truth
 * of it, so what the page draws after a press is this tally rather than its own.
 */
async function chatDoor(req, res) {
  const asked = new URL(req.url ?? '/', 'http://127.0.0.1');
  const answer = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const { pathname } = asked;
  const method = req.method ?? 'GET';

  // The page's first call: the handshake. It is answered for this run's one player (`player`), and
  // slowly — half a second — so that the black screen and its one word the page waits out on are there
  // to be read before the game is (`main.ts`, `index.html`).
  if (pathname === '/api/auth' && method === 'POST') {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return answer(200, { user: player });
  }

  // The log of a place: everything written after `after`, which is the whole of it for a page that has read
  // none of it. A request that names no tape asks for the lobby, which has no name to be asked by.
  if (pathname === '/api/messages' && method === 'GET') {
    const tape = asked.searchParams.get('tape') ?? '';
    const after = Number(asked.searchParams.get('after') ?? 0);
    return answer(200, { messages: chatLog.filter((line) => (line.tape ?? '') === tape && line.id > after) });
  }

  // A line written: taken down as it came, numbered, and given back with everything the store adds to it —
  // the byline included, which is the player the token belongs to rather than anything the line said
  // about itself (the real store joins its own `users` row in; this door has the one player).
  if (pathname === '/api/messages' && method === 'POST') {
    const draft = await chatBody(req);
    const line = {
      id: chatNext++,
      ...(draft.tape ? { tape: draft.tape } : {}),
      ...(draft.at_step === null || draft.at_step === undefined ? {} : { at_step: draft.at_step }),
      user_id: player.id,
      nick: player.nick,
      icon: player.icon,
      ghost: Boolean(draft.ghost),
      parts: draft.parts ?? [],
      sent_ms: Date.now(),
    };
    chatLog.push(line);
    // What is kept of a send is what the page handed over rather than what the store answered with: the
    // byline is the door's own stamp (`player`), and the wire is what a line is — and is not — allowed
    // to say about who wrote it.
    chatAsked.sent.push(draft);
    return answer(200, { message: line });
  }

  // The runs themselves, as the chat asks with (`?ids=`) — the rows of exactly those runs, without the ones
  // this server does not hold, which is what a line's link is drawn from — or, asked plainly, the whole list
  // the window's own list used to read (`store.Recordings`).
  if (pathname === '/api/recordings' && method === 'GET') {
    const ids = (asked.searchParams.get('ids') ?? '').split(',').filter(Boolean);
    if (ids.length) {
      const rows = [];
      for (const id of ids) {
        const row = chatRows.get(id) ?? (foreignRun?.row && foreignRun.id === id
          ? { ...foreignRun.row, label: foreignRun.label }
          : null);
        if (row) rows.push(row);
      }
      return answer(200, { recordings: rows });
    }
    return answer(200, { recordings: chatRuns });
  }

  // The run's own word in the chat: which line of the log is the run's, and what that line says. The page
  // writes both the moment its run begins — the line having just been taken down above — and rewrites the
  // words as the play goes on (`SetChat` in the real store, which also insists the words are the run's own
  // player's; this door has the one player and takes his word for it).
  const said = pathname.match(/^\/api\/recordings\/([^/]+)\/chat$/);
  if (said && method === 'POST') {
    const id = decodeURIComponent(said[1]);
    const note = await chatBody(req);
    const row = chatRows.get(id);
    if (!row) return answer(404, { error: `no recording ${id}` });
    if (note.label !== undefined) row.label = note.label;
    if (note.message !== undefined) row.message = note.message;
    chatSaid.push({ id, ...note });
    return answer(200, { recording: row });
  }

  // A run that is to arrive as it is played: opened with the head of the tape it will be, and answered with the
  // id its slices are sent to. Nothing of the run itself is taken down yet — a run with no slice in it is a run
  // with nothing in it (`Store.OpenRecording`), which is what a window closed on the first frame leaves behind.
  if (pathname === '/api/recordings/live' && method === 'POST') {
    const body = await chatBody(req);
    const run = {
      id: `live-${chatLive.opened.length + 1}`,
      name: body.name,
      author: player.nick,
      recordedMs: body.recorded_ms,
      head: body.head,
      slices: [],
      ended: false,
    };
    chatLive.opened.push(run);
    // The row the chat will ask with the moment a line links this run: live from here, and saying
    // nothing yet — the words come with the line that is about to be written for it.
    chatRows.set(run.id, {
      id: run.id,
      name: run.name,
      author: run.author,
      steps: 0,
      step_ms: 20,
      live: true,
      label: '',
    });
    return answer(201, { recording: { id: run.id, name: run.name, author: run.author, steps: 0, live: true } });
  }

  // One second of such a run, as the page hands it over: the steps it covers, the events and keyframes written
  // inside them, and whether that slice was the last one (`LiveWire.slice`). A slice of a run this server never
  // opened — or of one that has already ended — is a refusal, the way `AppendChunk` refuses both.
  const slice = pathname.match(/^\/api\/recordings\/([^/]+)\/chunks$/);
  if (slice && method === 'POST') {
    const id = decodeURIComponent(slice[1]);
    const body = await chatBody(req);
    const run = chatLive.opened.find((one) => one.id === id);
    if (!run || run.ended) {
      chatLive.refused.push(id);
      return answer(run ? 409 : 404, { error: run ? `recording ${id} takes no more slices` : `no recording ${id}` });
    }
    run.slices.push(body);
    run.ended = Boolean(body.last);
    const steps = run.slices.reduce((total, one) => total + one.steps, 0);
    const row = chatRows.get(id);
    if (row) {
      row.steps = steps;
      row.live = !run.ended;
    }
    return answer(200, { recording: { id, name: run.name, author: run.author, steps, live: !run.ended } });
  }

  // The door a run that is still being played is *read* back through: the head its tape was opened with, the
  // slices that have arrived after the one the viewer already has, and the run's own row — which is what says
  // how long it is now and whether it is still being played (`LiveWire.stream` in `frontend/src/live/api.ts`).
  // A viewer with nothing behind it asks past nothing (`after` below zero) and is answered the whole run so
  // far, which is how a run that began before the window arrived is watched from its own beginning.
  //
  // One run is served here and only one (`foreignRun`): the one the section at the foot of this file hands out,
  // a second of it at a time. Any other id is the server's own refusal, because a run nobody is playing is a
  // run with no door.
  const stream = pathname.match(/^\/api\/recordings\/([^/]+)\/chunks$/);
  if (stream && method === 'GET') {
    const id = decodeURIComponent(stream[1]);
    // A run that was uploaded whole has no head and no slices — which is what this door answers for
    // it, the way the real one does (`Store.Chunks` reads the row and finds no head): the asking
    // falls through to the run's own file, one door over.
    const whole = chatRows.get(id);
    if ((!foreignRun || foreignRun.id !== id) && whole && !whole.live) {
      return answer(200, { recording: whole, head: null, chunks: [] });
    }
    if (!foreignRun || foreignRun.id !== id) {
      return answer(404, { error: `no run called ${id} is being played` });
    }
    const after = Number(new URL(req.url ?? '/', 'http://localhost').searchParams.get('after') ?? -1);
    const arrived = foreignRun.arrived();
    const slices = foreignRun.slices.slice(0, arrived).filter((one) => one.seq > after);
    const steps = foreignRun.slices.slice(0, arrived).reduce((total, one) => total + one.steps, 0);
    foreignRun.asked.push({ after, got: slices.length, steps });
    return answer(200, {
      recording: { ...foreignRun.row, steps },
      head: foreignRun.head,
      chunks: slices,
    });
  }

  // One run's own tape: the file itself, byte for byte, because the game's own decoder is what reads it
  // (`api.ts` hands it on as text without an opinion about it). A run nobody has recorded is the server's
  // own refusal, which is what a row whose tape did not come down reads in the window.
  if (pathname.startsWith('/api/recordings/') && method === 'GET') {
    const id = decodeURIComponent(pathname.slice('/api/recordings/'.length));
    chatAsked.tapes.push(id);
    if (!chatTapes.has(id)) return answer(404, { error: `no run is called ${id}` });
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end(chatTapes.get(id));
  }

  return answer(404, { error: `no door at ${pathname}` });
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  // The chat's own doors are answered in this process rather than out of the build: the page asks a
  // server for the log and this run has none of its own (`chatDoor` above).
  if (url.startsWith('/api/')) return chatDoor(req, res);
  // The site's own userpics, read as origin-absolute paths (`userpic` in `frontend/src/chat/messages.ts`):
  // served straight out of the site's own folder at the root of the repository — the same files the
  // site itself hands out — so the faces in the chat, the ghost's own `i/ghost.gif` among them, are
  // the real ones rather than anything the build keeps of its own. (The site's gifs are wide 16 and as
  // tall as their frames stack; the page wears every one of them at 16×16, which is the site's own way
  // of wearing them.)
  if (url.startsWith('/i/')) {
    const file = join(root, '..', 'i', basename(url));
    if (!existsSync(file)) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': 'image/gif' });
    return res.end(readFileSync(file));
  }
  const file = normalize(join(root, 'frontend', 'dist', decodeURIComponent(url === '/' ? '/index.html' : url)));
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (!/favicon/.test(url)) console.log('404:', url);
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, resolve));
// The port the kernel hands out is a random one, and Chromium refuses to talk to about sixty of them
// (6566, 4045, 6667 ..) — so the browser is told the one this run got is allowed. Without it the run
// dies on `net::ERR_UNSAFE_PORT` every thirtieth time, with no relation to the game at all.
const port = server.address().port;

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-sandbox',
    `--explicitly-allowed-ports=${port}`,
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Waits the garden's own pan out: the stage's own layer is polled until it has *arrived* — its
 * transform within a pixel of where the location being moved to puts it — rather than until it has
 * stood still, because a page rendering in software WebGL can freeze mid-pan for whole frames at a
 * time and stillness says nothing. `at` is the location being moved to; the stage stands at its own
 * place in the row (`placeOf` in `App.vue`), one number that says where in the garden the player is.
 */
/**
 * Waits for a screen reading of the stage to stand still, and answers its last value: the camera
 * glides on after the world itself has stopped (its easing runs on the renderer's own clock, a
 * paused world notwithstanding), and a place read while it glides is a place a press aimed at it
 * between the two will miss.
 */
async function cameraStill(read, maxMs = 5000) {
  let was = await read();
  const began = Date.now();
  for (;;) {
    await wait(60);
    const now = await read();
    if (Math.abs(now - was) < 0.5 || Date.now() - began > maxMs) return now;
    was = now;
  }
}

const panSettled = (at) =>
  page.evaluate((where) => new Promise((resolve) => {
    const stage = document.querySelector('.location--stage');
    const target = (2 - where) * innerWidth;
    const xOf = (t) => {
      const m = t.match(/matrix\([^)]*,\s*(-?[\d.eE+]+),\s*(-?[\d.eE+]+)\)/);
      return m ? Number(m[1]) : 0;
    };
    const began = Date.now();
    const tick = () => {
      const t = getComputedStyle(stage).transform;
      if (Math.abs(xOf(t) - target) < 1.5 || Date.now() - began > 8000) return resolve(t);
      setTimeout(tick, 40);
    };
    tick();
  }), at);

/**
 * The chat's own screen arrived at *and standing in its contents*: the pan over, the panel showing,
 * and the log read — a line of it there to be seen. The last one is not a quibble: the screen's
 * contents wait the pan out before they appear (`App.vue`, whose whole point is a pan that carries
 * nothing but the scenery), so a pan that has stopped is not yet a chat that is there — and the log
 * is read off the server on the same arrival, a beat after the panel shows.
 */
const chatArrived = async () => {
  await panSettled(3);
  await page.waitForSelector('.chat-card', { visible: true, timeout: 8000 });
  await page.waitForSelector('.chat-card .chat-line', { timeout: 8000 });
};

/**
 * The chat's own screen arrived at with the *link asked for* in it: the pan over, the panel showing,
 * and a line of the log whose body links this run — which is what everything that opens a playback
 * from the chat needs, because the links are the list now, and the smoke writes more than one of
 * them into its log.
 */
const linkArrived = async (id) => {
  await chatArrived();
  await page.waitForSelector(`.chat-card .chat-line__run[data-run="${id}"]`, { timeout: 8000 });
};

const summary = { steps: [], lying: [], shadowSamples: [] };
/** Everything the run found wrong, whatever stage it found it at. Printed and exited on at the end. */
const problems = [];

async function state() {
  return page.evaluate(() => {
    const game = window.__garden;
    const particles = game.snapshot();
    return {
      particles: Object.fromEntries(
        Object.entries(particles).map(([name, p]) => [name, { x: Math.round(p.x), y: Math.round(p.y) }]),
      ),
      centreOfMassY: Number(game.centreOfMassY().toFixed(2)),
      speed: Number(game.engine.speed.toFixed(3)),
      held: game.engine.onHold ? game.engine.onHold.length : 0,
      // What the world was doing at the same moment: a tool that never got picked up, or a rope that is
      // only half drawn, is what the checks below look like from the outside when a click goes astray.
      tool: game.tool,
      draft: game.world.draft !== null,
      ropes: game.world.ropes.length,
    };
  });
}

/**
 * The strip of portraits in the world's own bottom right corner, as the renderer drew it.
 *
 * `radius` comes back in the same pixels as `width`, so it can be held against the CSS the toolbar's own
 * buttons are rounded with: a card wears the same fraction of itself that a button wears of itself.
 */
async function portraits() {
  return page.evaluate(() => {
    const inspect = window.__garden.inspect();
    return {
      // The world's own box, which the strip has to stay inside of: it is what the cards are measured
      // against, and it moves when the window does.
      world: inspect.world,
      cards: inspect.portraits.map((card) => ({
        ...card,
        // The face the doll's own machine is showing (`pain-state.ts`) and the picture the strip drew
        // for it are what the checks below are about; the positions come back rounded to a tenth of a
        // pixel because nobody reads fifteen digits of a layout.
        x: Number(card.x.toFixed(1)),
        width: Number(card.width.toFixed(1)),
      })),
    };
  });
}

/**
 * Where the world and the interface inside it are, as the renderer drew them — and as the page has
 * them, for the parts of the interface that are DOM rather than canvas.
 *
 * Everything comes back in canvas pixels: the renderer reports canvas ones, and the DOM's boxes are
 * measured from the corner of the page, so the canvas's own offset is taken off them here. That is
 * what lets a run say the bar is inside the world, a claim about two different systems at once.
 */
async function layout() {
  return page.evaluate(() => {
    const inspect = window.__garden.inspect();
    const canvas = document.querySelector('.stage canvas')?.getBoundingClientRect();
    const box = (element) => {
      const rect = element?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: rect.left - (canvas?.left ?? 0),
        y: rect.top - (canvas?.top ?? 0),
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      world: inspect.world,
      // ...and how much of the world's own picture that box is: a window with room for the hall shows
      // all 1000x740 of it, a narrower one shows a slice (`width`/`height` and `left`/`top` of it), and
      // a window too small for the smallest world shows it all at a `scale` below 1 (`stage.ts`).
      view: inspect.view,
      // The box the physics lives in, inside the world's own: the walls the doll hits and the floor she
      // comes to rest on (see `WALL_MARGIN_X`/`Y` and `wallsFor` in `frontend/src/game/stage.ts`).
      walls: inspect.walls,
      hud: inspect.hud,
      layers: inspect.layers,
      backdrop: inspect.backdrop,
      canvas: inspect.canvas,
      // Where the canvas sits on the page, which is what turns the canvas pixels the renderer reports
      // into the client pixels the DOM boxes above are given in — and the ones a screenshot is clipped
      // with. Zero in this page, since the canvas is the whole window, but a test need not assume it.
      offset: { x: canvas?.left ?? 0, y: canvas?.top ?? 0 },
      // The bar is DOM: this run is the only thing that can measure it.
      bar: box(document.querySelector('.toolbar')),
      // ...and so is the chat's own block, which stands in the world's bottom left corner: what a click
      // has to be kept clear of is the interface as a whole, the bar and the chat together.
      strip: box(document.querySelector('.chat-strip')),
      cards: inspect.portraits.map((card) => ({
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        // Which of a card's own corners is rounded, which the strip moves with the window (`CardCorner`
        // in `scene.ts`).
        corner: card.corner,
      })),
    };
  });
}

/**
 * What the doll's own machine is doing, per doll and in the world's own order: the step of the worst
 * source it last read, and the face it decided to wear (`Doll.pain`, `pain-state.ts`).
 *
 * The machine is what the pose is worth *as the built game reads it*, which is what the checks below are
 * about: the card may be higher than the step — the machine holds a face for a second or three after the
 * pose that earned it has gone — but never lower, and a pose that hurts nothing has to read as nothing.
 * Which step a pose is worth is asked in `frontend/tests/pain.test.ts`, and what the machine does with the steps
 * over time in `frontend/tests/pain-state.test.ts`, where the world can be held still.
 */
async function machines() {
  return page.evaluate(() => window.__garden.inspect().portraits.map((card) => card.machine));
}

/**
 * The shadows as the renderer last drew them: one box per doll that is casting one, in the world's own
 * pixels, with the strength it was drawn at and the height of her lowest joint above the floor.
 */
async function shadowBoxes() {
  return page.evaluate(() => window.__garden.inspect().shadows.map((shadow) => ({
    ...shadow,
    x: Number(shadow.x.toFixed(1)),
    alpha: Number(shadow.alpha.toFixed(4)),
    rise: Number(shadow.rise.toFixed(1)),
  })));
}

/** One pixel of a screenshot, as `[r, g, b]`, in the screenshot's own pixels — the only way to read a
 * backdrop: what the renderer was *asked* for is a promise, and a screenshot is what it kept. */
function pixelOf(shot, x, y) {
  const at = (Math.round(y) * shot.width + Math.round(x)) * 4;
  return [shot.data[at], shot.data[at + 1], shot.data[at + 2]];
}

/**
 * The lowest face a pose of a given step can be wearing, one per step of pain: a pose at *worry* cannot
 * be wearing the calm face, whatever else the machine is up to.
 *
 * The card is allowed to be *higher* than the step — that is the whole of `pain-state.ts`, which holds a
 * face for a second or three after the pose has gone (the arrival, a short break, the flicker) — but
 * never lower: every face the machine can pick from a step is at or above the one that step asks for.
 */
const LOWEST_FACE = [0, 2, 3, 3, 4];

/**
 * Checks a card against the step its own machine last read: the first card belongs to the first doll, so
 * the two have to be about the same pose (`Game.frame` reads it once per doll per step).
 */
function checkCardAgainstStep(label, cards, machines) {
  const worst = machines[0]?.worst ?? -1;
  const face = cards[0]?.portrait ?? -1;
  if (worst >= 0 && face < LOWEST_FACE[worst]) {
    problems.push(
      `${label}: her pose is worth ${worst} and her card is ${face}, below the ${LOWEST_FACE[worst]} that asks for`,
    );
  }
  return { worst, face };
}

/**
 * How wide one doll is drawn, in the same world pixels `Scene.inspect` reports: the two ends of the
 * box around every part of her, each part being a rotated rectangle, and how far down that box reaches.
 * This is the measurement the shadow itself is made of — its width *and* the height it fades by, which
 * is read from the bottom of the drawing — read back out of the renderer's own snapshot.
 */
function drawnAcross(parts) {
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const part of parts) {
    const cos = Math.abs(Math.cos(part.rotation));
    const sin = Math.abs(Math.sin(part.rotation));
    const half = (cos * part.width + sin * part.height) / 2;
    left = Math.min(left, part.x - half);
    right = Math.max(right, part.x + half);
    // The same box, the other way up: how far the part reaches below its own middle.
    bottom = Math.max(bottom, part.y + (cos * part.height + sin * part.width) / 2);
  }
  return { width: right - left, centre: (left + right) / 2, bottom };
}

/** The angle between her two thighs, in degrees, measured off the joints as they are drawn. */
function thighAngle(joints) {
  const thigh1 = { x: joints.knee1.x - joints.pants.x, y: joints.knee1.y - joints.pants.y };
  const thigh2 = { x: joints.knee2.x - joints.pants.x, y: joints.knee2.y - joints.pants.y };
  const cross = thigh1.x * thigh2.y - thigh1.y * thigh2.x;
  const dot = thigh1.x * thigh2.x + thigh1.y * thigh2.y;
  return (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
}

/**
 * The screen direction to pull one knee in to open her split: a quarter turn off her own thigh, taken
 * to the side the *other* thigh is not on. She ends up lying at whatever angle the fall left her, so
 * "to the left" means nothing — this does.
 */
function openingTowards(joints, part, other) {
  const thigh = { x: joints[part].x - joints.pants.x, y: joints[part].y - joints.pants.y };
  const opposite = { x: joints[other].x - joints.pants.x, y: joints[other].y - joints.pants.y };
  const quarter = { x: -thigh.y, y: thigh.x };
  const sign = quarter.x * opposite.x + quarter.y * opposite.y <= 0 ? 1 : -1;
  const length = Math.hypot(quarter.x, quarter.y) || 1;
  return { x: (quarter.x * sign) / length, y: (quarter.y * sign) / length };
}

/** The screen direction of her own back — a quarter turn off her torso — where a head pulled back goes. */
function backOf(joints) {
  const up = { x: joints.neck.x - joints.pants.x, y: joints.neck.y - joints.pants.y };
  const length = Math.hypot(up.x, up.y) || 1;
  return { x: -up.y / length, y: up.x / length };
}

/** The joints of the first doll on the stage, as they are drawn (per doll: `snapshot` blurs them). */
async function firstDoll() {
  return page.evaluate(() => window.__garden.overview().dollJoints[0]);
}

/**
 * Ties the pointer to the first doll's head and pulls it `reach` screen pixels along her own back —
 * or, with `along` at `'front'`, the other way along her own front — then photographs the strip and
 * hands back what it said.
 *
 * The direction is worked out from her *own* joints each time, taken and used inside this call,
 * because she is lying at whatever angle the fall (and the previous pull) left her at: "up" and "left"
 * would mean nothing here. The reading is taken while the pointer still has her, at the pull's
 * furthest.
 */
async function pullHead(shot, along, reach) {
  const joints = await firstDoll();
  const back = backOf(joints);
  const direction = along === 'back' ? back : { x: -back.x, y: -back.y };
  const head = joints.head;
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(head.x + (direction.x * reach * i) / 12, head.y + (direction.y * reach * i) / 12);
    await wait(20);
  }
  const reading = await portraits();
  await page.screenshot({ path: join(outDir, shot) });
  await page.mouse.up();
  await wait(150);
  return reading;
}

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
/*
 * The handshake on the way in, before anything about the world is read.
 *
 * The first thing the page is, until its player is signed in, is the black screen it always was with one
 * word on it (`index.html`): the game's server is asked about the token — and this run's server answers
 * half a second late, so the waiting itself is something to read rather than a flash. There is no hall
 * behind the word and no question over it: nothing is mounted until the player is known (`main.ts`),
 * because there is nobody to sign a line for until then.
 *
 * The word is read where it stands — the middle of the page, at reading size, in the chat's own colour on
 * the page's own black — and then the player lands on the garden's threshold: the first of its three
 * locations, the one the sentence about the place and the «Сцена» button are, with nothing of the game in
 * it at all (`App.vue`). The world is mounted behind it the whole time — the engine boots whatever the
 * player is looking at — and the button pans the garden along to the stage, which is what the middle of
 * the page is made of after it.
 */
const middleOfPage = () =>
  page.evaluate(() => {
    const at = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { tag: at?.tagName ?? null, className: String(at?.className ?? '') };
  });
/** The interface's own two colours, read out of the page's CSS rather than off this file: the palette is the page's to change, and the checks are about what is drawn being what the palette says. */
const palette = await page.evaluate(() => {
  const read = (name) => {
    const probe = document.createElement('div');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  };
  return { wood: read('--wood'), paper: read('--paper') };
});
const loading = await page.evaluate(() => {
  const word = document.querySelector('.loading');
  const box = word?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
  const style = word ? getComputedStyle(word) : null;
  return {
    text: word?.textContent ?? null,
    // Nothing is mounted while the page waits: no canvas, no interface — the word is the whole of the page.
    canvas: document.querySelector('canvas')?.tagName ?? null,
    centre: [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)],
    size: style?.fontSize ?? null,
    colour: style?.color ?? null,
  };
});
loading.middle = await middleOfPage();
summary.handshake = loading;
await page.screenshot({ path: join(outDir, '00-loading.png') });
// The server answers, the player lands on the threshold, and the way in is pressed like a player would:
// the garden pans one screen to the left — its three locations each carried by their own transform
// (`placeOf` in `App.vue`, `.location` in `src/styles.css`) — and the stage is what the middle of the
// page is made of once it has settled. Every click this run makes after this line is made as that
// player, on that stage.
await page.evaluate(() => new Promise((resolve) => {
  const tick = () => (window.__garden ? resolve(true) : setTimeout(tick, 20));
  tick();
}));
await wait(60);
const theSentence =
  'Говорят, если ночью в саду найти старую сцену, раздеться и лечь на неё, то станешь очень гибкой...';
summary.handshake.after = {
  gone: await page.evaluate(() => document.querySelector('.loading') === null),
  middle: await middleOfPage(),
  threshold: await page.evaluate(() => {
    const said = document.querySelector('.intro__said');
    const go = document.querySelector('.intro__go');
    const box = (element) => {
      const rect = element?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    return {
      // The sentence is written with breaks of line of its own (`<br>` in `App.vue`); the reading
      // flattens them back to one line, since the words are what is being checked against.
      said: said?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      saidAt: box(said),
      go: go?.textContent?.trim() ?? null,
      goAt: box(go),
    };
  }),
};
await page.screenshot({ path: join(outDir, '00-threshold.png') });
// The pan itself, read as where the stage's own layer has got to — it is the garden's needle: the
// stage stands at its own place in the row wherever the player is, so one transform says where the
// whole of the garden is.
await page.click('.intro__go');
await panSettled(2);
summary.handshake.entered = await page.evaluate(() => ({
  middle: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.tagName ?? null,
  stage: getComputedStyle(document.querySelector('.location--stage')).transform,
}));
await page.screenshot({ path: join(outDir, '00-playing.png') });
// What the page said on the way in, read as the one wait it is.
if (loading.text !== 'Loading...') problems.push(`the page waits on "${loading.text}", not "Loading..."`);
if (loading.canvas !== null) {
  problems.push('the hall is already there while the page is still waiting for its player');
}
if (loading.middle.tag !== 'P' || !loading.middle.className.includes('loading')) {
  problems.push(`the middle of the waiting page is ${loading.middle.tag}.${loading.middle.className}`);
}
// The word sits in the middle of the page: the viewport is 900x700, and a word centred on it is at 450,350.
if (Math.abs(loading.centre[0] - 450) > 2 || Math.abs(loading.centre[1] - 350) > 2) {
  problems.push(`the page waits at ${loading.centre.join(',')} rather than in the middle of it`);
}
if (loading.size !== '16px') problems.push(`the page waits at ${loading.size}, not at reading size`);
if (loading.colour !== palette.paper) {
  problems.push(`the page waits in ${loading.colour}, not in the chat's own colour`);
}
if (!summary.handshake.after.gone) problems.push('the waiting word stayed up after the player landed');
// The threshold: the sentence the garden is known by, centred, and the way in at the right of the
// screen, halfway down — the direction it goes being the direction it says.
const saidAt = summary.handshake.after.threshold.saidAt;
const goAt = summary.handshake.after.threshold.goAt;
if (summary.handshake.after.threshold.said !== theSentence) {
  problems.push(`the threshold says "${summary.handshake.after.threshold.said}", not the sentence`);
}
if (summary.handshake.after.threshold.go !== 'Сцена') {
  problems.push(`the way into the garden says "${summary.handshake.after.threshold.go}", not «Сцена»`);
}
// The sentence lives in the first third of the screen — the width the garden's own three locations
// are laid out in — centred inside its container, both ways: a 900-wide window puts a third's middle
// at 150.
if (Math.abs(saidAt.left + saidAt.width / 2 - 150) > 6 || Math.abs(saidAt.top + saidAt.height / 2 - 350) > 4) {
  problems.push(
    `the sentence stands at ${saidAt.left + saidAt.width / 2},${saidAt.top + saidAt.height / 2}, not centred in the first third`,
  );
}
if (goAt.left < 450 || Math.abs(goAt.top + goAt.height / 2 - 350) > 4) {
  problems.push(`the «Сцена» button stands at ${goAt.left},${goAt.top}, not at the right of the screen`);
}
// The stage has come to its own place in the row — the middle of the window — the threshold sliding
// out left of it and the canvas taking the page: the stage layer rests at no offset worth the name
// (read out of the matrix rather than off the string, a browser that lands a hair off zero has
// arrived just the same).
const panX = Number(summary.handshake.entered.stage.match(/matrix\([^)]*,\s*(-?[\d.eE+]+),\s*(-?[\d.eE+]+)\)/)?.[1] ?? 0);
if (summary.handshake.entered.middle !== 'CANVAS' || Math.abs(panX) > 1.5) {
  problems.push(
    `the stage is what the window looks at after «Сцена»: the middle is ` +
      `${summary.handshake.entered.middle}, the stage at ${summary.handshake.entered.stage}`,
  );
}
// The strip in the world's own bottom right corner is up from the first frame: one card, and the calm
// portrait — she is lying on the floor of the hall, put down there before the first frame by the port's
// opening (`World.layDown`), and a pose of rest reads nothing. (The pain is read while the world is quiet
// on purpose: a rope tied to her would pull the rig into a shape of its own within a frame.)
summary.portraits = { first: await portraits() };
// What her own machine reads at the same moment and for the same reason: she is lying on the floor, and
// nothing about the shape she is lying in is worth a step of pain.
summary.machines = { first: await machines() };
// Where the world and the interface in it are, and what colour everything outside them is.
summary.layout = { first: await layout() };
// The page's own chrome: the icon the tab and the address bar wear, which is the one picture of the port
// that never reaches the canvas. The document is asked for its own `rel="icon"` rather than for a path, so
// a wrong href is caught as well as a missing file, and what comes back has to be a real `.ico` holding
// the three sizes `tools/prepare-icon.mjs` bakes (see §11 of `docs/assets.md`).
const favicon = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return null;
  const response = await fetch(link.href);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // An `.ico` starts with two reserved zero bytes, a 1 — the file holds icons rather than cursors — and
  // the number of pictures in it.
  const head = new DataView(bytes.buffer, 0, 6);
  const count = head.getUint16(4, true);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    // One byte of width and one of height per picture, with 256 written as the byte 0.
    sizes.push(`${bytes[6 + i * 16] || 256}x${bytes[7 + i * 16] || 256}`);
  }
  return {
    href: link.href,
    status: response.status,
    bytes: bytes.length,
    type: head.getUint16(2, true),
    count,
    sizes,
  };
});
summary.favicon = favicon;
if (!favicon) {
  problems.push('the page declares no icon of its own');
} else if (favicon.status !== 200) {
  problems.push(`the page's own icon is a ${favicon.status} at ${favicon.href}`);
} else if (favicon.type !== 1) {
  problems.push(`the page's own icon is not an icon file at all (type ${favicon.type})`);
} else if (favicon.sizes.join(',') !== '16x16,32x32,48x48') {
  problems.push(
    `the page's own icon holds ${favicon.sizes.join(', ') || 'nothing'}, not 16x16, 32x32 and 48x48`,
  );
}
await wait(340);
await page.screenshot({ path: join(outDir, '01-start.png') });
// What is really painted between the window and the picture is read off the pixels of that screenshot:
// this window is smaller than the hall, so there is no black to read — the picture reaches the canvas'
// own edges, and the first and last pixels of it are the hall (see the big window below for the frame
// a window *bigger* than the hall gets). Sampled at the start of the run, with her lying on the floor in
// the middle of it and nowhere near those corners.
const startShot = decodePng(readFileSync(join(outDir, '01-start.png')));
summary.layout.first.pixels = {
  corner: pixelOf(startShot, 2, 2),
  farCorner: pixelOf(startShot, startShot.width - 3, startShot.height - 3),
  edges: [
    pixelOf(startShot, 2, Math.floor(startShot.height / 2)),
    pixelOf(startShot, Math.floor(startShot.width / 2), 2),
    pixelOf(startShot, startShot.width - 3, Math.floor(startShot.height / 2)),
    pixelOf(startShot, Math.floor(startShot.width / 2), startShot.height - 3),
  ],
  card: null,
};
// The cards are rounded, and that is a claim about pixels rather than about the number the renderer
// reports: the strip is drawn *over* the hall, so a card's own corner has to be showing the hall behind
// it — a square card would be showing its picture there. The middle of a card is the other end of the
// same claim: if that is the hall too, then no picture was drawn at all.
const firstCardArt = summary.portraits.first.cards[0];
if (firstCardArt) {
  const canvasAt = { x: firstCardArt.x + summary.layout.first.offset.x, y: firstCardArt.y + summary.layout.first.offset.y };
  const cornerPixel = pixelOf(startShot, canvasAt.x + 1, canvasAt.y + 1);
  // The hall *beside the corner*: what it is read against below is the card's own middle, and any pixel of
  // the hall would do for that. This one is a few pixels from the card, so the two readings are neighbours
  // in the same photograph rather than two places in the picture.
  const hallPixel = pixelOf(startShot, canvasAt.x - 2, canvasAt.y - 2);
  const facePixel = pixelOf(startShot, canvasAt.x + firstCardArt.width / 2, canvasAt.y + firstCardArt.height / 2);
  summary.layout.first.pixels.card = { corner: cornerPixel, hall: hallPixel, face: facePixel };
}
summary.steps.push({ step: 'start', state: await state() });

// The opening itself: she is *laid out* on the floor, so there is no fall to watch and no settling to
// wait through — what this stretch of the run is about is that she stays down. Her centre of mass is the
// one number gravity moves, and a doll lying flat on the floor has nowhere to take it: sampled over three
// seconds it may not move at all. Her shadow is sampled along with it, at the one height in the whole run
// where it is drawn at full strength — lying on the floor is where the fade is measured from.
let previous = null;
let strongestMove = 0;
const began = Date.now();
while (Date.now() - began < 3000) {
  const elapsed = Date.now() - began;
  const now = await state();
  if (previous !== null) strongestMove = Math.max(strongestMove, Math.abs(now.centreOfMassY - previous));
  previous = now.centreOfMassY;
  summary.lying.push({
    time: Number(((Date.now() - began) / 1000).toFixed(3)),
    centreOfMassY: now.centreOfMassY,
    neck: now.particles.neck,
  });
  const shadow = await shadowBoxes();
  summary.shadowSamples.push({
    time: Number(((Date.now() - began) / 1000).toFixed(3)),
    rise: shadow.length > 0 ? shadow[0].rise : null,
    alpha: shadow.length > 0 ? shadow[0].alpha : 0,
  });
  await wait(elapsed < 1000 ? 50 : 200);
}
await page.screenshot({ path: join(outDir, '02-lying.png') });
summary.lyingMove = strongestMove;
// How she is lying, off the renderer's own view of her joints: a rig with no thickness lies in the only
// shape it has — every joint on the line the walls' floor is (`World.layDown`) — so the box they cover is
// a line, and it sits on the floor rather than above it. (Her *drawing* is not measured here: a baked part
// is a sprite with a great deal of transparent padding around the body it holds, and the box around those
// is not the shape of her.)
summary.lyingJoints = await page.evaluate(() => {
  const points = Object.values(window.__garden.snapshot());
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    width: Number((Math.max(...xs) - Math.min(...xs)).toFixed(1)),
    height: Number((Math.max(...ys) - Math.min(...ys)).toFixed(1)),
    lowest: Number(Math.max(...ys).toFixed(1)),
  };
});
const first = summary.lying[0];
const last = summary.lying[summary.lying.length - 1];
summary.lyingDrift = last.centreOfMassY - first.centreOfMassY;
summary.settledY = last.centreOfMassY;
summary.steps.push({ step: 'lying', state: await state() });

// Pause with the hidden key, then resume.
await page.keyboard.press('Space');
await wait(150);
const paused = await state();
await wait(600);
const stillPaused = await state();
summary.pauseHeldStill = Math.abs(paused.centreOfMassY - stillPaused.centreOfMassY) < 0.001;
// What the pause is for: reading the pose without the world moving under it. A pose made while the world
// stands still — she is at rest on the floor, and this run swings both her legs back under her by hand —
// is still a pose, and her card has to follow it: a card left on a face from before the pause would be the
// machine frozen while the world it reads holds still, which is what `World.observe` is for.
summary.pausedPose = await (async () => {
  await page.evaluate(() => {
    const game = window.__garden;
    const at = (name) => game.engine.particles.find((p) => p.name === name);
    const pants = at('pants');
    // Both thighs swung back under a still pelvis: the *hips* ladder, which is the one a pair of legs
    // going the same way is read on (`extensionOf` in `pain.ts`). Backwards is a *negative* turn on
    // screen: her back is +x for a body lying the way the movie drew her (see `docs/pain.md`).
    const radians = (-55 * Math.PI) / 180;
    for (const name of ['knee1', 'foot1', 'knee2', 'foot2']) {
      const p = at(name);
      const dx = p.x - pants.x;
      const dy = p.y - pants.y;
      p.x = pants.x + dx * Math.cos(radians) - dy * Math.sin(radians);
      p.y = pants.y + dx * Math.sin(radians) + dy * Math.cos(radians);
      // Both positions, or the swing is read as a throw: Verlet takes a particle's velocity from where
      // it *was*, and four legs moved a whole thigh's length in one step would send the doll out of the
      // frame at a thousand pixels a second the moment the world is resumed — the trap `World.layDown`
      // pays the same attention to. What is being made here is a pose, not a kick.
      p.oldx = p.x;
      p.oldy = p.y;
    }
  });
  await wait(200);
  const reading = await machines();
  const cards = await portraits();
  const worst = reading[0]?.worst ?? -1;
  return {
    machines: reading,
    cards: cards.cards,
    worst,
    agreed: worst >= 0 && (cards.cards[0]?.portrait ?? -1) >= LOWEST_FACE[worst],
  };
})();
await page.screenshot({ path: join(outDir, '03-paused.png') });
await page.keyboard.press('Space');
await wait(150);

// Drag her with the real pointer: press on her chest, sweep up and to the left, release.
const drag = await page.evaluate(() => {
  const game = window.__garden;
  const chest = game.snapshot().stomach;
  return { from: game.toScreen(chest.x, chest.y) };
});
await page.mouse.move(drag.from.x, drag.from.y);
await page.mouse.down();
const heldAtStart = (await state()).held;
// Where the pointer goes, in fractions of the window: press her chest, sweep her up and to the left,
// hold her up there, then bring her back down. How far up the sweep goes is part of what the run is
// for rather than a detail of it — the fade of her shadow is read against it (`summary.shadowSamples`
// below), and those readings want a doll up off the floor with no shadow left at all — so the top of
// the path is most of the way to the picture's own top edge, and the leg in the middle of it is her
// being *held* up there long enough for a reading to land on it.
const path = [
  { t: 0, x: 0.6, y: 0.35 },
  { t: 0.9, x: 0.35, y: 0.12 },
  { t: 1.6, x: 0.4, y: 0.14 },
  { t: 2.4, x: 0.5, y: 0.6 },
];
const dragBegan = Date.now();
let frames = 0;
while (Date.now() - dragBegan < path[path.length - 1].t * 1000) {
  const elapsed = (Date.now() - dragBegan) / 1000;
  let i = 0;
  while (i < path.length - 2 && path[i + 1].t < elapsed) i++;
  const k = Math.max(0, Math.min(1, (elapsed - path[i].t) / (path[i + 1].t - path[i].t)));
  const x = 900 * (path[i].x + (path[i + 1].x - path[i].x) * k);
  const y = 700 * (path[i].y + (path[i + 1].y - path[i].y) * k);
  await page.mouse.move(x, y);
  await wait(40);
  if (frames % 12 === 0) {
    await page.screenshot({ path: join(outDir, `04-drag-${String(frames).padStart(2, '0')}.png`) });
    // The other end of the shadow's fade, sampled here: this is the stretch of the run where she is up in
    // the player's hand, and a shadow is measured against the height of her lowest joint.
    const shadow = await shadowBoxes();
    summary.shadowSamples.push({
      time: Number(((Date.now() - dragBegan) / 1000).toFixed(3)),
      rise: shadow.length > 0 ? shadow[0].rise : null,
      alpha: shadow.length > 0 ? shadow[0].alpha : 0,
    });
  }
  frames++;
}
const dragged = await state();
await page.screenshot({ path: join(outDir, '05-dragged.png') });
await page.mouse.up();
summary.drag = {
  heldAtStart,
  heldWhileDragging: dragged.held,
  chestAtRelease: dragged.particles.stomach,
  neckAtRelease: dragged.particles.neck,
};
await wait(1500);
const after = await state();
await page.screenshot({ path: join(outDir, '06-after-release.png') });
summary.afterRelease = { fell: after.centreOfMassY - dragged.centreOfMassY, state: after };
summary.steps.push({ step: 'after-drag', state: after });

// The same drag with a finger: the game is played on a touch screen with no mouse at all, so the
// gesture is sent through the browser's own touch input — the events a phone really sends, pointer by
// pointer. What is checked is that she comes off the floor in the hand and goes back down when the
// finger is lifted, and that one hand at a time is the rule (`Game.pointer`): a second finger while she
// is being held must not take her out of the first one's hand.
//
// She is put back in her authored pose first (`r`), and the reason is the drag above rather than the
// touch: a doll yanked about and let go keeps the velocity it was yanked with — that is the movie's own
// integrator — and at the fifth of its clock the game runs at, she sails up out of the frame and takes
// several seconds to come down again. A finger can only take hold of a doll that is there.
await page.keyboard.press('r');
await wait(150);
const touchClient = await page.createCDPSession();
await touchClient.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const touch = (type, points) => touchClient.send('Input.dispatchTouchEvent', { type, touchPoints: points });
const fingerAt = await page.evaluate(() => {
  const game = window.__garden;
  const torso = game.snapshot().stomach;
  return game.toScreen(torso.x, torso.y);
});
const beforeTouch = await state();
await touch('touchStart', [{ id: 1, x: fingerAt.x, y: fingerAt.y }]);
await wait(80);
const heldByFinger = (await state()).held;
// A second finger, well clear of her: it is ignored, so the doll goes on following the first one.
await touch('touchStart', [
  { id: 1, x: fingerAt.x, y: fingerAt.y },
  { id: 2, x: fingerAt.x - 220, y: fingerAt.y },
]);
for (let i = 1; i <= 10; i++) {
  await touch('touchMove', [
    { id: 1, x: fingerAt.x, y: fingerAt.y - i * 16 },
    { id: 2, x: fingerAt.x - 220, y: fingerAt.y + i * 6 },
  ]);
  await wait(30);
}
const byTouch = await state();
await page.screenshot({ path: join(outDir, '24-touch-drag.png') });
await touch('touchEnd', []);
// Let go of, she is no longer *at the finger*: while the finger was down her torso sat on the pointer, and
// the pull left her with a velocity, so a moment later she is somewhere else entirely. A doll still standing
// exactly where the finger left her would mean the touch was never really released.
//
// How far she gets in that moment is the movie's own business and not the wall clock's — this is a software
// renderer on whatever machine is running it, and the frames that fall inside a second and a half of it are
// not a fixed number: read once at a fixed moment, she was 9 world pixels along in one run and 36 in another,
// the same code both times. So what is waited for here is the leaving itself — she is read once she is clear
// of the spot the finger left her at — and a doll still hanging off a pointer that was never lifted never
// gets clear of it at all, however long the wait.
const driftFromFinger = (now) =>
  Math.hypot(
    now.particles.stomach.x - byTouch.particles.stomach.x,
    now.particles.stomach.y - byTouch.particles.stomach.y,
  );
const leavingBegan = Date.now();
let afterTouch = await state();
let drift = driftFromFinger(afterTouch);
// The most she ever got from the spot, not the last reading: a doll released mid-air falls past her
// own dangle point and can settle with her stomach back beside it, and what the release promises is
// the *leaving*, not the landing.
let leftBy = drift;
while (leftBy <= 10 && Date.now() - leavingBegan < 5000) {
  await wait(120);
  afterTouch = await state();
  drift = driftFromFinger(afterTouch);
  leftBy = Math.max(leftBy, drift);
}
await touchClient.send('Emulation.setTouchEmulationEnabled', { enabled: false });
summary.touch = {
  heldByFinger,
  heldByTwoFingers: byTouch.held,
  lifted: afterTouch.held,
  rise: Number((beforeTouch.centreOfMassY - byTouch.centreOfMassY).toFixed(1)),
  drift: Number(leftBy.toFixed(1)),
  settled: Number(drift.toFixed(1)),
};

// The touch screen: a finger on the glass is a hand on the doll — the same grab, the same drag, the
// same release as the mouse — and it is one hand at a time, so a second finger neither takes her away
// from the first one nor leaves her held when the first is lifted.
const touchRun = summary.touch;
if (!(touchRun.heldByFinger > 0)) {
  problems.push(
    `a finger on the doll at ${fingerAt.x}, ${fingerAt.y} took hold of nothing (tool ${beforeTouch.tool}, ` +
      `${beforeTouch.held} in hand before the finger, and she moved ` +
      `${(byTouch.centreOfMassY - beforeTouch.centreOfMassY).toFixed(1)} px under it)`,
  );
}
if (touchRun.heldByTwoFingers !== touchRun.heldByFinger) {
  problems.push(
    `a second finger left ${touchRun.heldByTwoFingers} particles in hand, not the ${touchRun.heldByFinger} the first had`,
  );
}
if (touchRun.lifted !== 0) problems.push(`${touchRun.lifted} particles were still held after the finger came off`);
if (!(touchRun.rise > 20)) problems.push(`a finger dragged her up by ${touchRun.rise} world pixels`);
// Whether she falls or will not stop tumbling once the finger is gone is the ragdoll's own business; what
// is asked here is that she is *not still at the finger* — a doll pinned to the pointer would mean the touch
// was never really released — and the wait above gave her five whole seconds of wall clock to be clear of it.
if (!(touchRun.drift > 10)) {
  problems.push(`she is still standing where the finger left her (${touchRun.drift} world pixels away)`);
}

// Respawn with the hidden key and check she is back in the authored pose.
await page.keyboard.press('r');
await wait(100);
const respawned = await state();
summary.respawn = respawned;
await page.screenshot({ path: join(outDir, '07-respawn.png') });

// The toolbar: the rope is a button in the bar itself, so this part clicks it the way a player would.
// The tool is the player's to keep — drawing a rope does not hand the arrow back — so the tool is
// checked after every action just the same.
//
// The two clicks are made with the world *paused* and it is resumed before the knot is carried: a click
// only counts when it lands on a texel of her own artwork (`Doll.hitTest`), and a doll who is falling — or
// being hauled about by the rope she is tied to — moves several pixels between a click being aimed and it
// arriving. The hidden pause key is part of the game (the arrow keys and `r` are used above and below),
// and a player who wants to tie a rope to a falling doll neatly would use it too.
await page.keyboard.press('Space');
await wait(150);
await page.click('[data-tool="rope"]');
// What the button click did, on both sides of the wire: the bar is Vue's, the tool is the world's, and a
// click that never arrived is the difference between those two.
const pickedRope = await page.evaluate(() => ({
  dom: document.querySelector('.toolbar [data-tool].is-active')?.dataset.tool ?? null,
  world: window.__garden.tool,
}));
if (pickedRope.world !== 'rope' || pickedRope.dom !== 'rope') {
  problems.push(
    `picking the rope from the bar left the tool as ${pickedRope.dom} in the bar and ${pickedRope.world} in the world`,
  );
}
const ropeFrom = await page.evaluate(() => {
  const game = window.__garden;
  const torso = game.snapshot().stomach;
  return game.toScreen(torso.x, torso.y);
});
const ropeTo = await page.evaluate(() => window.__garden.toScreen(-150, 130));
await page.mouse.move(ropeFrom.x, ropeFrom.y);
await page.mouse.click(ropeFrom.x, ropeFrom.y);
await page.mouse.move(ropeTo.x, ropeTo.y);
await wait(80);
await page.screenshot({ path: join(outDir, '08-rope-draft.png') });
await page.mouse.click(ropeTo.x, ropeTo.y);
await wait(150);
summary.toolbar = { drawn: await page.evaluate(() => window.__garden.overview()), pickedRope };
summary.toolbar.toolAfterRope = summary.toolbar.drawn.tool;
// ...and the cord is on the stage as well as drawn: a live world draws the ropes the player ties.
summary.toolbar.ropeDrawing = await page.evaluate(() => ({
  onStage: window.__garden.inspect().ropes.length,
}));
await page.screenshot({ path: join(outDir, '09-rope.png') });
// Back to the running clock: what the rope is for is what it does to her, and that takes a stepping world.
await page.keyboard.press('Space');
await wait(1500);

// The arrow tool carries a knot about — and since a rope takes whatever is on its far end with it,
// the doll comes too. She is lying on the floor by now, so any movement is the rope's doing.
await page.click('[data-tool="drag"]');
await wait(120);
const aim = await page.evaluate(() => window.__garden.overview());
summary.toolbar.toolAfterArrow = aim.tool;
const knot = aim.anchorHandles[1];
const tied = aim.anchorHandles[0];
if (!knot || !tied) {
  // Everything below this line is about carrying one of the rope's ends about, so a rope that was never
  // drawn — or was drawn without tying itself to her — leaves nothing to ask. What the run knows about
  // why is read out here rather than left to a stack trace.
  const where = (await state()).particles.stomach;
  problems.push(
    `the rope has ${aim.anchorHandles.length} ends to carry (${aim.ropes} ropes on the stage, tool ${aim.tool}, ` +
      `bar ${pickedRope.dom}, her stomach at ${where.x}, ${where.y}, the clicks aimed at ` +
      `${Math.round(ropeFrom.x)}, ${Math.round(ropeFrom.y)} and ${Math.round(ropeTo.x)}, ${Math.round(ropeTo.y)})`,
  );
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('problems:', problems.length, problems.join('; '));
  process.exit(1);
}
// Where the rope's free end may be put: anywhere in the *picture* — a knot is not the body, and the
// walls are not a box a rope is kept in (`Particle2D.clamped`), so the free end may go out into the
// scenery beside them or above them and stay there — but clear of the interface, which is where a click
// lands on a button rather than on the knot: the bar's own buttons at the world's left edge, the chat's
// block under them against the same edge, and the band the strip of portraits makes along the world's own
// foot, at the other end of it. Every
// one of those boxes is read, from the renderer and from the page.
const knotWorld = summary.layout.first.world;
const knotBar = summary.layout.first.bar;
const knotStrip = summary.layout.first.strip;
const knotCards = summary.layout.first.cards;
const interfaceLeft = Math.max(knotBar.x + knotBar.width, knotStrip ? knotStrip.x + knotStrip.width : 0);
// The strip is a band across the world's own foot, so the room has to stop *above* a card's top edge now
// rather than below its bottom one — the same way it stops short of the bar on the left.
const interfaceFoot = Math.min(knotWorld.y + knotWorld.height, ...knotCards.map((card) => card.y));
const room = {
  left: Math.max(knotWorld.x + 20, interfaceLeft + 20),
  right: knotWorld.x + knotWorld.width - 20,
  top: knotWorld.y + 20,
  bottom: Math.max(knotWorld.y + 20, interfaceFoot - 20),
};
// And to the far end of that room: the corner of it farthest from the knot on her body among those nearest
// her own height — the room's own foot, whichever end of it is the farther away. The rope's point is that a
// taut one hauls her *along*, and a free end flung to the top of the room would lift her up out of the
// picture instead, where nothing below this line can click her or read the rope's own middle. The path
// there does not matter — the pointer carries the knot — so the end position is the whole of the pull.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const corners = [
  { x: room.left, y: room.top },
  { x: room.left, y: room.bottom },
  { x: room.right, y: room.top },
  { x: room.right, y: room.bottom },
];
const footOfRoom = Math.max(...corners.map((corner) => corner.y));
const knotTarget = corners
  .filter((corner) => corner.y === footOfRoom)
  .reduce((best, corner) => (distance(corner, tied) > distance(best, tied) ? corner : best));
const beforeDrag = await page.evaluate(() => window.__garden.snapshot().stomach);
// The knot's own place in the world, read in the same tick as the view it is drawn in and as the
// assist's tally: hauling her along like this is what makes a narrow window's camera follow her
// (`camera.ts`), and the drag is anchored against that pan (`Game.grab`) — the knot goes where the
// *hand* carries it on the glass, not where the moving camera has the world under the pointer by the
// end. The one camera motion that does reach the hand is the edge assist, and it reports everything
// it has carried (`Camera.carriedSoFar`), so the promise checked below can stay exact: where the knot
// ends up is the hand's own travel plus what the assist said it carried, and nothing else.
const knotWorldPlace = () =>
  page.evaluate(() => {
    const garden = window.__garden;
    const inspect = garden.inspect();
    const view = inspect.view;
    const handle = garden.overview().anchorHandles[1];
    return {
      x: view.left + (handle.x - view.x) / view.scale,
      y: view.top + (handle.y - view.y) / view.scale,
      scale: view.scale,
      carried: inspect.camera.carried,
    };
  });
const grabWorld = await knotWorldPlace();
await cameraStill(() => page.evaluate(() => window.__garden.overview().anchorHandles[1]?.y ?? -1));
const knotStill = await page.evaluate(() => window.__garden.overview().anchorHandles[1]);
await page.mouse.move(knotStill.x, knotStill.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(
    knot.x + ((knotTarget.x - knot.x) * i) / 10,
    knot.y + ((knotTarget.y - knot.y) * i) / 10,
  );
  await wait(25);
}
await page.screenshot({ path: join(outDir, '10-knot-carried.png') });
await page.mouse.up();
// Read the drop at once, before the world has a chance to move anything, and then pause it.
const dropWorld = await knotWorldPlace();
const droppedAt = await page.evaluate(() => window.__garden.overview());
summary.toolbar.hauledHerBy = await page.evaluate(
  (before) => {
    const now = window.__garden.snapshot().stomach;
    return { x: now.x - before.x, y: now.y - before.y };
  },
  beforeDrag,
);
await page.keyboard.press('Space');
await wait(120);
summary.toolbar.afterKnotDrag = droppedAt;
await page.screenshot({ path: join(outDir, '11-knot-dropped.png') });

// The same knot, carried by the rope's own tool: a press near an end of a rope already tied takes
// hold of that end instead of laying a new rope's start, so the point of a rope can be moved without
// putting the tool down — and the tool stays the rope's through the whole carry, since a tool is the
// player's to keep. The world is already stood still here (the arrow's own carry put it so), which is
// what keeps the pressed-at place where it was read — and standing still is its own check: a knot in
// hand follows the pointer whatever the clock is doing.
//
// The carry goes out and comes back: the knot is hauled to the top of the room and read there — the
// reading is the excursion, and the drop is where the knot was found, so the cord the sections below
// burn and carry is the cord they were written around rather than one re-hung across the middle of
// everything.
await page.click('[data-tool="rope"]');
const knotY = () => page.evaluate(() => window.__garden.overview().anchorHandles[1]?.y ?? -1);
await cameraStill(knotY);
const ropeHandStart = await page.evaluate(() => window.__garden.overview().anchorHandles[1]);
const stageHigh = await page.evaluate(() => {
  const canvas = document.querySelector('.stage canvas').getBoundingClientRect();
  return { x: canvas.left + canvas.width / 2, y: canvas.top + 90 };
});
await page.mouse.move(ropeHandStart.x, ropeHandStart.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(
    ropeHandStart.x + ((stageHigh.x - ropeHandStart.x) * i) / 8,
    ropeHandStart.y + ((stageHigh.y - ropeHandStart.y) * i) / 8,
  );
  await wait(25);
}
summary.toolbar.knotInRopeHand = await page.evaluate(
  (from) => {
    const handle = window.__garden.overview().anchorHandles[1];
    return { carried: handle ? { x: handle.x, y: handle.y } : null, from };
  },
  ropeHandStart,
);
for (let i = 7; i >= 0; i--) {
  await page.mouse.move(
    ropeHandStart.x + ((stageHigh.x - ropeHandStart.x) * i) / 8,
    ropeHandStart.y + ((stageHigh.y - ropeHandStart.y) * i) / 8,
  );
  await wait(25);
}
await page.mouse.up();
summary.toolbar.knotInRopeHand = {
  ...summary.toolbar.knotInRopeHand,
  movedBy: summary.toolbar.knotInRopeHand.carried
    ? Math.hypot(
        summary.toolbar.knotInRopeHand.carried.x - ropeHandStart.x,
        summary.toolbar.knotInRopeHand.carried.y - ropeHandStart.y,
      )
    : 0,
  tool: await page.evaluate(() => window.__garden.overview().tool),
  ropes: await page.evaluate(() => window.__garden.overview().ropes),
};
if (summary.toolbar.knotInRopeHand.tool !== 'rope') {
  problems.push(`carrying a knot with the rope tool left the tool as ${summary.toolbar.knotInRopeHand.tool}`);
}
if (!(summary.toolbar.knotInRopeHand.movedBy > 40)) {
  problems.push(
    `the rope tool's press on a knot did not take it in hand (moved ${Math.round(summary.toolbar.knotInRopeHand.movedBy)} px)`,
  );
}
if (summary.toolbar.knotInRopeHand.ropes !== 1) {
  problems.push(`a press on a knot laid a rope instead (${summary.toolbar.knotInRopeHand.ropes} ropes on the stage)`);
}
// Back to the arrow, which is the tool the rest of the run is written around — and the pointer off
// the bar onto the stage, with the buttons' own colour change waited out as a fact rather than as a
// number of milliseconds: it is 0.12 s of main-thread work, and the main thread is busy rendering a
// world in software, which stretches a transition without telling anybody.
await page.click('[data-tool="drag"]');
await page.mouse.move(stageHigh.x, stageHigh.y);
await page.waitForFunction(
  () => {
    const drag = document.querySelector('.toolbar [data-tool="drag"]');
    const rope = document.querySelector('.toolbar [data-tool="rope"]');
    return (
      getComputedStyle(drag).backgroundColor === 'rgb(192, 192, 192)' &&
      getComputedStyle(drag).color === 'rgb(0, 0, 0)' &&
      getComputedStyle(rope).backgroundColor === 'rgb(0, 0, 0)' &&
      getComputedStyle(rope).color === 'rgb(192, 192, 192)'
    );
  },
  { timeout: 8000 },
);
// The bar itself: three buttons hanging from the top of the world's own left edge — the arrow, then the
// rope, then the chat's at the very foot of the stack, that one being the only button of the three that
// picks no tool. Each is a black square with a drawing the colour of the hall's own wood in it, since the
// bar lies over the hall, and the one in the player's hand is the same square the other way round. Where
// the bar *is* — against the world's own left edge, hanging from the world's top — is read with the rest
// of the layout, and what each button wears for the pointer on it is read straight after.
summary.toolbar.layout = await page.evaluate(() =>
  [...document.querySelectorAll('.toolbar [data-tool]')].map((button) => {
    const style = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    return {
      tool: button.dataset.tool,
      active: button.classList.contains('is-active'),
      left: Math.round(box.left),
      top: Math.round(box.top),
      width: box.width,
      // What the browser really painted: the two colours a tool is made of, the edge drawn around them,
      // and the rounding the one corner a card rounds wears the same fraction of (see `CARD_RADIUS` in
      // `scene.ts`).
      background: style.backgroundColor,
      colour: style.color,
      borderColour: style.borderTopColor,
      borderWidth: Number.parseFloat(style.borderTopWidth),
      radius: Number.parseFloat(style.borderTopLeftRadius),
    };
  }),
);

// Each of those buttons also wears the word a player calls it — «Таскать», «Связывать», «Чатъ» — while the
// pointer is on it and not otherwise: a word beside the square rather than over it, since a caption laid over
// a button covers the very thing the button presses on, and no control of its own, so that a press where the
// word stands belongs to whatever is under it (the hall, or the chat's own four lines for the lower two). A
// hover is the browser's own and nothing synthetic makes one, so the pointer really goes to each button in
// turn; `null` is the pointer off the bar altogether, in the middle of the hall, where no word is up.
/**
 * Puts the pointer on one button of the bar — or off the bar altogether, in the middle of the hall, which is
 * what `null` asks for — and waits for the browser to have answered with a hover.
 *
 * The point is worked out here rather than asked of the page's own `hover`, because a hover is the browser's
 * own and nothing synthetic makes one: the pointer really crosses the glass. It is carried there *in steps*,
 * the way a hand crosses the bar, and put there again if the word has not come up — one jump of the pointer
 * is one event, and this page (software WebGL, a frame every tick) is not the place to trust that it landed.
 */
async function pointPointer(tool) {
  const spot = await page.evaluate((t) => {
    const world = window.__garden.inspect().world;
    const canvas = document.querySelector('.stage canvas')?.getBoundingClientRect();
    const middle = {
      x: (canvas?.left ?? 0) + world.x + world.width / 2,
      y: (canvas?.top ?? 0) + world.y + world.height / 2,
    };
    if (!t) return { hall: middle };
    const rect = document.querySelector(`.toolbar [data-tool="${t}"]`).getBoundingClientRect();
    return {
      hall: middle,
      button: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    };
  }, tool);
  if (!spot.button) {
    await page.mouse.move(spot.hall.x, spot.hall.y);
    await wait(200);
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    // Across the hall to the bar, and then up onto the button itself.
    await page.mouse.move(spot.button.x - 30, spot.button.y, { steps: 2 });
    await page.mouse.move(spot.button.x, spot.button.y, { steps: 3 });
    await wait(200);
    const answered = await page.evaluate(
      (t) =>
        Number.parseFloat(
          getComputedStyle(document.querySelector(`.toolbar [data-tool="${t}"] .hint`)).opacity,
        ) > 0.5,
      tool,
    );
    if (answered) return;
  }
}

async function hintsAt(tool) {
  await pointPointer(tool);
  return page.evaluate(() => {
    const inspect = window.__garden.inspect();
    const scale = inspect.hud.scale || 1;
    const world = inspect.world;
    const canvas = document.querySelector('.stage canvas')?.getBoundingClientRect();
    return [...document.querySelectorAll('.toolbar [data-tool]')].map((button) => {
      const hint = button.querySelector('.hint');
      const style = getComputedStyle(hint);
      const at = hint.getBoundingClientRect();
      const square = button.getBoundingClientRect();
      // What a press at the word's own middle would land on, asked of the browser: a word that was a control
      // would answer for itself here.
      const landed = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
      return {
        tool: button.dataset.tool,
        word: hint.textContent.trim(),
        // The word is the button's own name in the markup as well, which is what a screen reader reads out.
        name: button.getAttribute('aria-label'),
        shown: Number.parseFloat(style.opacity) > 0.5,
        // Where the word stands, in the interface's own pixels: off the right edge of the square and level
        // with the middle of it, both of which are `styles.css`'s own numbers (`.hint`).
        gap: (at.left - square.right) / scale,
        level: (at.top + at.height / 2 - (square.top + square.height / 2)) / scale,
        width: at.width / scale,
        height: at.height / scale,
        // The word is part of the picture: it stands inside the world's own box, not out on the black.
        inside:
          at.left - (canvas?.left ?? 0) >= world.x - 0.5 &&
          at.right - (canvas?.left ?? 0) <= world.x + world.width + 0.5 &&
          at.top - (canvas?.top ?? 0) >= world.y - 0.5 &&
          at.bottom - (canvas?.top ?? 0) <= world.y + world.height + 0.5,
        clicks: style.pointerEvents,
        overItself: landed === hint,
        landed: landed?.getAttribute('class') ?? landed?.tagName ?? null,
        background: style.backgroundColor,
        colour: style.color,
        borderColour: style.borderTopColor,
        borderWidth: Number.parseFloat(style.borderTopWidth),
        radius: Number.parseFloat(style.borderTopLeftRadius),
      };
    });
  });
}
summary.toolbar.hints = {
  // Read off the bar each time, with the pointer somewhere else: the key is where the pointer was.
  rest: await hintsAt(null),
  drag: await hintsAt('drag'),
  rope: await hintsAt('rope'),
  chat: await hintsAt('chat'),
};
// A picture of it while one is up: the rope's word, standing over the hall. The pointer is put on that
// button again for it, since a word is worth a screenshot the way any other part of the page is.
await pointPointer('rope');
await page.screenshot({ path: join(outDir, '12-bar-words.png') });

// The chat, which is part of the interface rather than of the hall: the last four messages in a strip
// standing in the world's own bottom left corner — across the foot of the picture from the bar that
// hangs at its top left one — and the screen of its own that the strip and the bar's chat button are
// both the way into, the garden's third location. The log behind it is this run's own
// server's (`chatDoor` at the top of this file): six messages in the lobby, one of them holding a gif, the
// newest carrying a like somebody else left. So what is asked here is the interface: four lines 300 px
// wide, in the chat's own colour, one message to a line and no wrapping, the strip standing inside the
// world on its own bottom left corner, the screen those two ways in pan to — one screen to the right
// of the stage, with the way back and the speaker's own switch in it — and a line sent from the field
// landing in the log and in the strip as the same thing, signed by whoever the field said — handed
// over to the server once.
const sender = 'проверка связи';
// The strip is a button as well as a block of text, so it brightens under the pointer the way the bar's
// own buttons do: that is read first, and then the pointer is taken off it — to the middle of the hall —
// because everything else asked of the strip below is about it at rest.
const stripMid = await page.evaluate(() => {
  const rect = document.querySelector('.chat-strip').getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
await page.mouse.move(stripMid.x, stripMid.y);
await wait(150);
summary.chat = {};
summary.chat.hover = await page.evaluate(() => getComputedStyle(document.querySelector('.chat-strip')).color);
const hallMid = await page.evaluate(() => {
  const world = window.__garden.inspect().world;
  const canvas = document.querySelector('.stage canvas').getBoundingClientRect();
  return { x: canvas.left + world.x + world.width / 2, y: canvas.top + world.y + world.height / 2 };
});
await page.mouse.move(hallMid.x, hallMid.y);
await wait(150);
summary.chat.before = await page.evaluate(() => {
  // The canvas is the whole window, but the two systems are still measured apart (see `layout`): the
  // renderer's boxes are canvas pixels and the DOM's are the page's.
  const canvas = document.querySelector('.stage canvas')?.getBoundingClientRect();
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left - (canvas?.left ?? 0)),
      right: Math.round(rect.right - (canvas?.left ?? 0)),
      top: Math.round(rect.top - (canvas?.top ?? 0)),
      bottom: Math.round(rect.bottom - (canvas?.top ?? 0)),
      width: rect.width,
      height: rect.height,
    };
  };
  const strip = document.querySelector('.chat-strip');
  const lines = [...strip.querySelectorAll('.chat-line')];
  const bar = document.querySelector('.toolbar');
  const button = bar.querySelector('[data-tool="chat"]');
  const style = getComputedStyle(strip);
  const measured = window.__garden.inspect();
  return {
    lines: lines.length,
    width: box(strip).width,
    strip: box(strip),
    button: box(button),
    bar: box(bar),
    // The world's own box, which the strip has to be inside of: the chat is in the picture, not on the
    // black around it. The interface's own corner, scale and height come with it: the bar is DOM, so that is
    // what says how tall the pile of buttons standing on the world's own foot is meant to be.
    world: measured.world,
    hud: measured.hud,
    colour: style.color,
    nowrap: getComputedStyle(lines[0]).whiteSpace,
    mask: style.maskImage,
    clicks: style.pointerEvents,
    badges: [...strip.querySelectorAll('.chat-line__badge')].map((img) => `${img.naturalWidth}x${img.naturalHeight}`),
    gifs: strip.querySelectorAll('.chat-line__gif').length,
  };
});
await page.screenshot({ path: join(outDir, '12-chat-strip.png') });

// The screen: the chat's own location — the third of the garden's three — arrived at by the garden
// panning a screen to the left, over its own scenery (`bg-3.png`), its words in the chat's own
// colour and nothing behind them but the picture. It is opened by the *strip* here rather than by the
// bar's own button, so that the click on the lines is checked too — the two are two ways into the
// same screen. A sampler is set going before the click, so the pan itself is caught on the wing:
// where the stage's own layer was, frame by frame — the chat lies one screen to the right of the
// stage, and arriving at it has to be the whole picture travelling left, the stage sliding out to
// left of the window a window's width.
await page.evaluate(() => {
  window.__slideSeen = new Set();
  const began = performance.now();
  const tick = () => {
    window.__slideSeen.add(getComputedStyle(document.querySelector('.location--stage')).transform);
    if (performance.now() - began < 1500) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.click('.chat-strip');
await chatArrived();
summary.chat.slide = await page.evaluate(() => [...window.__slideSeen]);
summary.chat.window = await page.evaluate(() => {
  const card = document.querySelector('.chat-card');
  const line = card.querySelector('.chat-line');
  const nick = line.querySelector('b');
  const field = card.querySelector('.chat-card__field');
  const input = card.querySelector('.chat-card__input');
  const speaker = card.querySelector('.chat-card__speaker');
  const send = card.querySelector('.chat-card__send');
  const back = card.querySelector('.chat-card__back');
  return {
    background: getComputedStyle(card).backgroundColor,
    colour: getComputedStyle(card).color,
    // Where the garden itself has got to, and what each of the three screens is wearing behind its
    // own content: the pan is the travel, the pictures are the place.
    stage: getComputedStyle(document.querySelector('.location--stage')).transform,
    introBack: getComputedStyle(document.querySelector('.location--intro')).backgroundImage,
    chatBack: getComputedStyle(document.querySelector('.location--chat')).backgroundImage,
    parts: [...card.children].map((child) => child.className),
    // The heading: the way back at the left of it, the name of the place beside it.
    title: card.querySelector('.chat-card__title')?.textContent ?? null,
    // The heading: the way back at the left of it, the name of the place centred across the screen.
    titleAt: (() => {
      const rect = card.querySelector('.chat-card__title')?.getBoundingClientRect();
      return rect ? { left: rect.left, width: rect.width } : null;
    })(),
    back: back?.textContent.trim() ?? null,
    lines: card.querySelectorAll('.chat-line').length,
    wraps: getComputedStyle(line).whiteSpace,
    nick: nick.textContent,
    bold: getComputedStyle(nick).fontWeight,
    colon: line.textContent.slice(nick.textContent.length, nick.textContent.length + 2),
    badge: `${line.querySelector('.chat-line__badge').naturalWidth}x${line.querySelector('.chat-line__badge').naturalHeight}`,
    send: send.textContent.trim(),
    // The field: one frame around the whole of it, and a text box inside that has no frame and no fill of
    // its own — and the field and the button beside it are one height.
    fieldBorder: Number.parseFloat(getComputedStyle(field).borderTopWidth),
    inputBorder: Number.parseFloat(getComputedStyle(input).borderTopWidth),
    inputBackground: getComputedStyle(input).backgroundColor,
    fieldHeight: Math.round(field.getBoundingClientRect().height),
    sendHeight: Math.round(send.getBoundingClientRect().height),
    // Who the field says is speaking, and which way its triangle points.
    speaker: speaker.querySelector('.chat-card__nick').textContent,
    speakerBadge: `${speaker.querySelector('.chat-card__badge').naturalWidth}x${speaker.querySelector('.chat-card__badge').naturalHeight}`,
    speakerIcon: speaker.querySelector('.chat-card__badge').getAttribute('src'),
    caret: speaker.querySelector('.chat-card__caret path').getAttribute('d'),
    pressed: speaker.getAttribute('aria-pressed'),
    // The log and nothing beside it: the runs are links inside the conversation now, and the first run
    // this page played has already said itself — its line is the page's own word «Начал игру», worn as
    // a link whose words come from the run's own row (`useRunStates`).
    chat: card.querySelector('.chat-card__log') !== null,
    runLine: (() => {
      const link = card.querySelector('.chat-line__run');
      return link ? link.closest('.chat-line').textContent.trim() : null;
    })(),
  };
});
await page.screenshot({ path: join(outDir, '13-chat-window.png') });

// The switch: the whole of the field's left end is one button, and pressing it makes the player the
// ghost — another nickname, another badge, the triangle the other way up. What is sent from then on is
// signed that way, and pressing it again puts the player back.
await page.click('.chat-card__speaker');
// The ghost's badge is an <img> the switch itself has only just asked for, and a fixed wait is a
// raffle: the badge is waited for by what it is — a picture the browser has finished with.
await page.waitForFunction(
  () => (document.querySelector('.chat-card__speaker .chat-card__badge')?.naturalWidth ?? 0) > 0,
  { timeout: 4000, polling: 50 },
);
summary.chat.ghost = await page.evaluate(() => {
  const speaker = document.querySelector('.chat-card__speaker');
  return {
    nick: speaker.querySelector('.chat-card__nick').textContent,
    badge: `${speaker.querySelector('.chat-card__badge').naturalWidth}x${speaker.querySelector('.chat-card__badge').naturalHeight}`,
    icon: speaker.querySelector('.chat-card__badge').getAttribute('src'),
    caret: speaker.querySelector('.chat-card__caret path').getAttribute('d'),
    pressed: speaker.getAttribute('aria-pressed'),
  };
});
// A line is typed into the field and sent — with a space in it, which is a check of its own: the game's
// keys are for the stage, and a field is not the stage.
await page.type('.chat-card__input', sender);
await page.click('.chat-card__send');
await wait(300);
summary.chat.sent = await page.evaluate(() => {
  // The newest line of the log: an entry is a line and the buttons under it, so it is the last entry that
  // carries the line just sent rather than the last `.chat-line` in the document (which every line is).
  const last = document.querySelector('.chat-card__log .chat-entry:last-of-type .chat-line');
  return {
    field: document.querySelector('.chat-card__input').value,
    log: [...document.querySelectorAll('.chat-card .chat-line')].map((line) => line.textContent.trim()),
    strip: [...document.querySelectorAll('.chat-strip .chat-line')].map((line) => line.textContent.trim()),
    badge: `${last.querySelector('.chat-line__badge').naturalWidth}x${last.querySelector('.chat-line__badge').naturalHeight}`,
    icon: last.querySelector('.chat-line__badge').getAttribute('src'),
  };
});
// And what the server was handed for it: the line as it was written, addressed to the lobby (which is to
// say addressed to nothing), signed by whoever the field said — and handed over once, since one press is
// one line.
summary.chat.sent.took = chatAsked.sent.at(-1);
summary.chat.sent.asked = chatAsked.sent.length;
await page.screenshot({ path: join(outDir, '14-chat-sent.png') });

// ...and back to being themselves: the same button, the other way round.
await page.click('.chat-card__speaker');
await wait(150);
summary.chat.back = await page.evaluate(() => {
  const speaker = document.querySelector('.chat-card__speaker');
  return {
    nick: speaker.querySelector('.chat-card__nick').textContent,
    caret: speaker.querySelector('.chat-card__caret path').getAttribute('d'),
    pressed: speaker.getAttribute('aria-pressed'),
  };
});
// The way back: one button, one pan to the right, and the garden is the stage again. The chat's
// screen does not go away — it stays where it is in the garden, one screen to the right of the
// stage, which is what leaving it looks like: the conversation itself sliding out rather than a
// screen blanking under the pan.
await page.click('.chat-card__back');
await panSettled(2);
summary.chat.stillOpen = await page.evaluate(() => {
  const card = document.querySelector('.chat-card');
  return card ? getComputedStyle(card).display !== 'none' : false;
});
summary.chat.backAt = await page.evaluate(
  () => getComputedStyle(document.querySelector('.location--stage')).transform,
);



// What all of that adds up to: four lines of four messages under the bar and against the world's own
// left edge, inside the world, in the chat's own colour, with the strip itself taking a click; a screen
// that opens — one pan of the garden to the left — on the chat's paper, with a heading of the way back
// and the name of the place and two columns under it — the conversation and the runs; a field of one
// frame, as tall as the button beside it, saying who is speaking; and a line sent from that field landing
// in the log and in the strip as the same thing, signed by whoever the field said.
const chatStrip = summary.chat.before;
const chatWindow = summary.chat.window;
const chatGhost = summary.chat.ghost;
const chatSent = summary.chat.sent;
const chatBack = summary.chat.back;
if (chatStrip.lines !== 4) {
  problems.push(`the chat's strip shows ${chatStrip.lines} lines, not the four it is`);
}
if (chatStrip.width !== 300) problems.push(`the chat's block of text is ${chatStrip.width} px wide, not 300`);
// The chat button is one of the bar's own — as wide as the bar and no wider — and the strip stands in
// the opposite corner of the picture from it: the world's bottom left, with the bar at its top left,
// both against the same left edge.
if (chatStrip.button.right !== chatStrip.bar.right) {
  problems.push(`the chat button ends at ${chatStrip.button.right} px with the bar ending at ${chatStrip.bar.right}`);
}
if (chatStrip.strip.left !== chatStrip.bar.left) {
  problems.push(
    `the chat's strip starts at ${chatStrip.strip.left} px with the bar starting at ${chatStrip.bar.left}`,
  );
}
// The chat is part of the picture: the strip stands inside the world's own box, not out on the black.
const chatRight = chatStrip.world.x + chatStrip.world.width;
const chatFloor = chatStrip.world.y + chatStrip.world.height;
if (Math.abs(chatStrip.strip.bottom - (chatFloor - chatStrip.hud.scale * 12)) > 1) {
  problems.push(
    `the chat's strip ends at y = ${chatStrip.strip.bottom}, not standing on the world's own corner ` +
      `(${(chatFloor - chatStrip.hud.scale * 12).toFixed(1)})`,
  );
}
if (
  chatStrip.strip.left < chatStrip.world.x ||
  chatStrip.strip.right > chatRight ||
  chatStrip.strip.bottom > chatFloor
) {
  problems.push(
    `the chat's strip is at ${chatStrip.strip.left}..${chatStrip.strip.right}, ${chatStrip.strip.bottom}, ` +
      `outside a world of ${chatStrip.world.x}..${chatRight}, ${chatFloor}`,
  );
}
// The bar is a pile of buttons hanging from the world's own top rather than a column floating down its
// left edge: its own box is nothing but the three of them, and its head — the arrow, the first of the
// three — is the world's own top, one inset in. The numbers in between are the interface's own (three
// 44 px buttons 8 px apart), and the browser's box has to land on them.
const barStack = 3 * 44 + 2 * 8;
if (Math.abs(chatStrip.bar.top - (chatStrip.world.y + chatStrip.hud.scale * 12)) > 1) {
  problems.push(
    `the bar starts at y = ${chatStrip.bar.top}, not hanging from the world's top ` +
      `(${(chatStrip.world.y + chatStrip.hud.scale * 12).toFixed(1)})`,
  );
}
if (Math.abs(chatStrip.bar.height - chatStrip.hud.scale * barStack) > 1) {
  problems.push(
    `the bar is ${chatStrip.bar.height.toFixed(1)} px tall, not the ` +
      `${(chatStrip.hud.scale * barStack).toFixed(1)} of its three buttons`,
  );
}
if (chatStrip.button.bottom !== chatStrip.bar.bottom) {
  problems.push(
    `the chat's button ends at ${chatStrip.button.bottom} px with the bar ending at ${chatStrip.bar.bottom}`,
  );
}
if (chatStrip.colour !== palette.paper) problems.push(`the chat's text is ${chatStrip.colour}`);
// ...and under the pointer it is the bar's own white, the way a button of the bar answers a hover.
if (summary.chat.hover !== 'rgb(255, 255, 255)') {
  problems.push(`the chat's strip answers a hover with ${summary.chat.hover}`);
}
if (chatStrip.nowrap !== 'nowrap') problems.push(`a line on the chat's strip wraps (${chatStrip.nowrap})`);
if (!chatStrip.mask.includes('16px')) problems.push(`the strip's own fade is ${chatStrip.mask}`);
if (chatStrip.clicks !== 'auto') problems.push(`the strip takes no clicks (${chatStrip.clicks})`);
if (chatStrip.badges.some((size) => !size.startsWith('16x'))) {
  problems.push(`the strip's badges are ${chatStrip.badges.join(', ')}, not the site's own sixteen-wide gifs`);
}
// The strip draws the gifs of the messages it shows — the last four of the log, which now includes the
// line the page's own run said itself with, so which gifs those are is read off the log rather than
// assumed: a strip that drew fewer than its own lines carry would be a strip losing pictures.
{
  const carried = chatLog
    .slice(-4)
    .reduce((count, one) => count + one.parts.filter((part) => part.kind === 'gif').length, 0);
  if (chatStrip.gifs !== carried) {
    problems.push(`the strip drew ${chatStrip.gifs} of the ${carried} gifs in the messages it shows`);
  }
}
// The screen is over its own scenery rather than on paper: no background of its own at all, and its
// words in the chat's own colour — the same colour the strip in the world's corner reads in.
if (chatWindow.background !== 'rgba(0, 0, 0, 0)' || chatWindow.colour !== palette.paper) {
  problems.push(`the chat screen is ${chatWindow.background} with ${chatWindow.colour} on it`);
}
// The travel: the third location is one screen right of the second, so arriving at it is the whole
// garden moving one window to the left — the world the player leaves sliding out to the left, the
// chat sliding in from the right — and the sampler has to have caught it doing exactly that. (The
// viewport is 900 wide: the stage's own layer travels from 0 at the stage to -900 one window left of
// it, which is where the player stands at the chat.)
const xOf = (transform) => Number(transform.match(/matrix\([^)]*,\s*(-?[\d.eE+]+),\s*(-?[\d.eE+]+)\)/)?.[1] ?? 0);
const slides = summary.chat.slide ?? [];
if (Math.abs(xOf(chatWindow.stage) + 900) > 2) {
  problems.push(`the chat was arrived at with the garden at ${chatWindow.stage}`);
}
if (slides.length < 2 || !slides.some((one) => xOf(one) < -450)) {
  problems.push(`the garden did not travel left into the chat (${slides.length} frames of the pan seen)`);
}
// And the place: each screen of the garden wears its own picture behind its own content.
if (!/bg-1\.png/.test(chatWindow.introBack)) {
  problems.push(`the first location wears ${chatWindow.introBack}, not its own picture`);
}
if (!/bg-3\.png/.test(chatWindow.chatBack)) {
  problems.push(`the third location wears ${chatWindow.chatBack}, not its own picture`);
}
if (chatWindow.parts.join() !== 'chat-card__head,chat-card__body,chat-card__form') {
  problems.push(`the chat window's own parts are ${chatWindow.parts.join(', ')}`);
}
if (!chatWindow.chat) {
  problems.push('the chat window is not the conversation it is');
}
// The first run this page played has said itself: its line is in the log, wearing the page's own
// name and the words every run's line starts with — the link's words, read from the run's row.
if (!chatWindow.runLine || !chatWindow.runLine.startsWith(`${player.nick}: Начал `) || !chatWindow.runLine.includes('игру')) {
  problems.push(`a run the page began was said in the chat as ${JSON.stringify(chatWindow.runLine)}`);
}
if (!(chatWindow.lines > chatStrip.lines)) {
  problems.push(`the chat window shows ${chatWindow.lines} messages where the strip shows ${chatStrip.lines}`);
}
if (chatAsked.sent.filter((one) => one.parts?.[0]?.kind === 'text').length !== 1) {
  problems.push(`a line sent was handed to the server ${chatSent.asked} times`);
}
if (chatWindow.wraps !== 'normal') problems.push(`a message in the chat window does not wrap (${chatWindow.wraps})`);
if (chatWindow.bold !== '700' || chatWindow.colon !== ': ') {
  problems.push(`a message opens with "${chatWindow.nick}" in ${chatWindow.bold} and "${chatWindow.colon}" after it`);
}
if (!chatWindow.badge.startsWith('16x')) problems.push(`a message in the window opens with a ${chatWindow.badge} badge`);
if (chatWindow.send !== 'Отправить') problems.push(`the chat window's button says "${chatWindow.send}"`);
// The heading of the screen: the way back at the left of it, the name of the place beside it — a
// screen is left by a way back rather than closed by a cross.
if (chatWindow.title !== 'Чат с привидениями') problems.push(`the chat's heading says "${chatWindow.title}"`);
// A place is named over its middle: the title's own centre is the screen's own.
if (chatWindow.titleAt && Math.abs(chatWindow.titleAt.left + chatWindow.titleAt.width / 2 - 450) > 6) {
  problems.push(
    `the chat's heading is centred at ${Math.round(chatWindow.titleAt.left + chatWindow.titleAt.width / 2)}, not the middle of the screen`,
  );
}
if (chatWindow.back !== 'Назад') problems.push(`the way back says "${chatWindow.back}", not «Назад»`);
// The field: one frame around the whole of it, a text box inside that neither draws a frame of its own
// nor fills itself in, and the field and the button beside it the same height.
if (chatWindow.fieldBorder !== 1 || chatWindow.inputBorder !== 0) {
  problems.push(
    `the chat's field is framed ${chatWindow.fieldBorder}px around the whole of it and ` +
      `${chatWindow.inputBorder}px around the text inside`,
  );
}
if (chatWindow.inputBackground !== 'rgba(0, 0, 0, 0)') {
  problems.push(`the chat's text box is filled ${chatWindow.inputBackground}`);
}
if (chatWindow.fieldHeight !== chatWindow.sendHeight) {
  problems.push(
    `the chat's field is ${chatWindow.fieldHeight} px tall with the button beside it ${chatWindow.sendHeight}`,
  );
}
// The field's own left end says who is speaking, and that is the whole of what switches between the
// player and the ghost: the name the site answered the handshake with — not «Ты» and not anything chosen
// here, so what stands here is the site's own word for this player coming out at the other end of the page
// — with their own userpic the next line will be signed by, and the triangle of a combobox, pointing down
// for the player and up for the ghost.
if (chatWindow.speaker !== player.nick || !chatWindow.speakerBadge.startsWith('16x') || !chatWindow.speakerIcon.endsWith('/i/2.gif')) {
  problems.push(
    `the chat's field opens as "${chatWindow.speaker}" with a ${chatWindow.speakerBadge} badge ` +
      `(${chatWindow.speakerIcon})`,
  );
}
if (chatWindow.pressed !== 'false') {
  problems.push(`the field's speaker button says it is pressed (${chatWindow.pressed})`);
}
if (chatGhost.nick !== 'Привидение') problems.push(`the ghost is called "${chatGhost.nick}"`);
if (!chatGhost.badge.startsWith('16x') || !chatGhost.icon.endsWith('/i/ghost.gif')) {
  problems.push(`the ghost wears a ${chatGhost.badge} badge (${chatGhost.icon}), not the site's own ghost`);
}
if (chatGhost.caret === chatWindow.caret) problems.push("the speaker's triangle did not turn over");
if (chatGhost.pressed !== 'true') {
  problems.push(`the ghost's speaker button says it is pressed (${chatGhost.pressed})`);
}
if (chatSent.log.length !== chatWindow.lines + 1 || !(chatSent.log.at(-1) ?? '').endsWith(sender)) {
  problems.push(`a line sent read back as "${chatSent.log.at(-1)}" in a log of ${chatSent.log.length}`);
}
if (chatSent.field !== '') problems.push(`the field kept "${chatSent.field}" after its line was sent`);
// ...and signed by the ghost, badge and all, in the log and in the strip both.
if (!(chatSent.log.at(-1) ?? '').startsWith(chatGhost.nick)) {
  problems.push(`a line sent anonymously is signed "${chatSent.log.at(-1)}"`);
}
if (!chatSent.badge.startsWith('16x') || !chatSent.icon.endsWith('/i/ghost.gif')) {
  problems.push(`a line sent anonymously wears a ${chatSent.badge} badge (${chatSent.icon})`);
}
// What went out on the wire for it: the line as it was written — the ghost's flag and the body, nothing
// else — and addressed to the lobby, the place with no name, whose lines carry no `tape` and no anchor at
// all. Who it is by is not the line's to say any more: the token carries that, and this run's server
// answers for it in its own tally (`nick` and `icon` in `chatAsked.sent`).
if (chatSent.took.ghost !== true || 'nick' in chatSent.took || 'badge' in chatSent.took) {
  problems.push(`the server was handed ${JSON.stringify(chatSent.took)} for a line sent as the ghost`);
}
if ((chatSent.took.tape ?? '') !== '' || (chatSent.took.at_step ?? null) !== null) {
  problems.push(`a line sent in the lobby went out addressed as ${JSON.stringify(chatSent.took)}`);
}
if (JSON.stringify(chatSent.took.parts) !== JSON.stringify([{ kind: 'text', text: sender }])) {
  problems.push(`a line sent went out as ${JSON.stringify(chatSent.took.parts)}`);
}
if (chatSent.strip.length !== 4 || chatSent.strip.at(-1) !== chatSent.log.at(-1)) {
  problems.push(`the strip's newest line is "${chatSent.strip.at(-1)}", not the "${chatSent.log.at(-1)}" just sent`);
}
// Pressing the same button again puts the player back: their own name, their own badge, the triangle
// pointing down again.
if (chatBack.nick !== chatWindow.speaker || chatBack.pressed !== 'false') {
  problems.push(`pressing the speaker again left the field as "${chatBack.nick}" (pressed ${chatBack.pressed})`);
}
if (chatBack.caret !== chatWindow.caret) problems.push("the speaker's triangle did not come back");
if (summary.chat.stillOpen) problems.push('the chat screen stayed up after «Назад» was clicked');
if (Math.abs(xOf(summary.chat.backAt)) > 2) {
  problems.push(`the way back left the garden at ${summary.chat.backAt}, not the stage`);
}

// The things that used to arrive from the "+" palette — a doll and a stone — are put on the stage
// through the engine's own calls. The bar has no "+" any more (the world is the game, not a level
// editor), but the stage still has to hold what it is given, and the tool stays exactly where the
// player left it — a doll arriving is not the arrow's business (`World.addDoll`).
await page.evaluate(() => window.__garden.addDoll());
await wait(400);
summary.toolbar.toolAfterDoll = await page.evaluate(() => window.__garden.overview().tool);

// And once more: a second doll, which is what the strip below wants a second card of. The sprites are
// the renderer's own answer to a doll arriving, and in a page rendering in software WebGL a frame is
// not a cheap thing — so this waits for the parts to be drawn rather than for a clock: the whole of
// the cast, eleven sprites a doll, standing in the renderer before anything is read of it. The cap is
// for a renderer that never catches up: the reading below says so in its own words if it comes to that.
await page.evaluate(() => window.__garden.addDoll());
await page.evaluate(() => new Promise((resolve) => {
  const began = Date.now();
  const tick = () => {
    const inspect = window.__garden.inspect();
    if ((inspect.dolls > 0 && inspect.parts.length >= inspect.dolls * 11) || Date.now() - began > 10000) {
      return resolve(true);
    }
    setTimeout(tick, 50);
  };
  tick();
}));
summary.toolbar.toolAfterSecondDoll = await page.evaluate(() => window.__garden.overview().tool);
summary.toolbar.afterAdd = await page.evaluate(() => window.__garden.overview());
summary.inspectAdded = await page.evaluate(() => window.__garden.inspect());
await page.screenshot({ path: join(outDir, '15-dolls.png') });

// Three dolls on the stage, three cards in the strip: the world's own order, 1rem between two cards,
// and the whole strip hung off the world's own right edge, inside it.
summary.portraits.added = await portraits();

// Let the world settle again, then hold it still for the burn: the handles below are read once and
// pressed afterwards, so nothing may move in between — and the world standing still is what makes the
// burst the press leaves behind worth reading, since it belongs to the frame clock rather than to a
// step and plays out with the world stopped (`Scene.popRope`).
await page.keyboard.press('Space');
await wait(600);
await page.keyboard.press('Space');
await wait(120);

// Taking a rope off the stage is the arrow's own doing, not a tool to pick up first: the pointer over
// the *middle* of a rope's cord wears a crosshair — the whole of the offer, nothing being drawn on the
// stage for it — and a press there takes the rope away. The ends of the cord are not offered that way:
// those are the knots a hand takes hold of to carry a rope about, and the cursor is what tells the
// player which of the two the press is about to be (`Rope.middleDistance`, `END_SEGMENTS`).
const doomed = await page.evaluate(() => {
  const garden = window.__garden;
  return { ...garden.overview(), ropeNodes: garden.inspect().ropes[0]?.nodes ?? 0 };
});
/** The cursor the page is wearing at a client point, as the browser computes it. */
const cursorAt = async (x, y) => {
  await page.mouse.move(x, y);
  await wait(150);
  return page.evaluate(() => getComputedStyle(document.querySelector('.stage canvas')).cursor);
};
const middle = doomed.ropeHandles[0];
if (!middle) {
  problems.push('the rope was gone before the arrow could take it');
} else {
  summary.toolbar.cursorOverRope = await cursorAt(middle.x, middle.y);
  const knot = doomed.anchorHandles[0];
  summary.toolbar.cursorOverKnot = await cursorAt(knot.x, knot.y);
  // The press, aimed from the screen point a player's would be and read back as the world point it
  // landed on: that is where the burst opens out from, so a burst anywhere else is a burst of some
  // other thing (`Burst.x`/`y`).
  const meant = await page.evaluate((point) => {
    const canvas = document.querySelector('.stage canvas').getBoundingClientRect();
    const view = window.__garden.inspect().view;
    return {
      x: view.left + (point.x - canvas.left - view.x) / view.scale,
      y: view.top + (point.y - canvas.top - view.y) / view.scale,
    };
  }, middle);
  await page.mouse.click(middle.x, middle.y);
  // Read at once, before there is time for the burst to have run its course: the rope is off the stage
  // the moment the press returns, and what is left of it is the renderer's own picture of it going.
  summary.toolbar.burn = await page.evaluate((at) => {
    const inspect = window.__garden.inspect();
    return {
      ropes: inspect.ropes.length,
      meant: at,
      bursts: inspect.bursts.map((burst) => ({
        nodes: burst.nodes,
        x: Number(burst.x.toFixed(1)),
        y: Number(burst.y.toFixed(1)),
        age: Number(burst.age.toFixed(3)),
        // How far the ring has opened, which is what says it is nine times as quick as the rest of the
        // burst: read again below well inside the burst, where it has to be at its full reach already.
        ring: Number(burst.ring.toFixed(1)),
      })),
    };
  }, meant);
  // The ring's own time is a ninth of the burst's (`RING_SECONDS` in `scene.ts`), so a quarter of a second
  // in the ring is as far out as it ever goes while the rope it came off is still burning.
  await wait(240);
  summary.toolbar.burnLater = await page.evaluate(() =>
    window.__garden.inspect().bursts.map((burst) => ({
      age: Number(burst.age.toFixed(3)),
      ring: Number(burst.ring.toFixed(1)),
    })),
  );
  summary.toolbar.afterBurn = await page.evaluate(() => window.__garden.overview());
  summary.toolbar.toolAfterBurn = summary.toolbar.afterBurn.tool;
  await page.screenshot({ path: join(outDir, '16-burned.png') });
  // ...and the picture outlives the rope by the length of the burst and is then dropped rather than
  // drawn at nothing, with the world standing exactly where it was.
  await wait(1000);
  summary.toolbar.afterBurst = await page.evaluate(() => window.__garden.inspect().bursts.length);
  summary.toolbar.cursorAfterBurn = await cursorAt(middle.x, middle.y);
  await page.screenshot({ path: join(outDir, '16-burned-out.png') });
}
// And a press on a doll with the arrow, which is what the stage has always done with one: she is taken
// hold of rather than taken away, and the stage is what it was — the only thing a press can spend is a
// rope, and there is none left (`World.press` reaches a doll to hold her particles and no further).
const newest = doomed.dollHandles[2] ?? doomed.dollHandles.at(-1);
if (newest) {
  await page.mouse.click(newest.x, newest.y);
  await wait(200);
}
summary.toolbar.afterDollClick = await page.evaluate(() => window.__garden.overview());
await page.keyboard.press('Space');

// What the strip is for: the pain of a pose, and the poses it is read from. Her head is pulled along
// her own back and then the other way along her own front — the arch, both ways — and then her knees
// are pulled apart — the split. Every pull is aimed along *her* own geometry rather than "up" or
// "left", because by now she is lying at whatever angle the game left her at. The joints are read per
// doll, since `snapshot` files particles by name and would hand back the last doll's knee while the
// strip's first card belongs to the first doll.
summary.pain = { calm: await portraits(), thighs: Number(thighAngle(await firstDoll()).toFixed(1)) };
summary.pain.arch = {
  front: await pullHead('17-arch-front.png', 'front', 140),
  back: await pullHead('17-arch-back.png', 'back', 140),
};

const reach = 220;
for (const [part, other] of [
  ['knee1', 'knee2'],
  ['knee2', 'knee1'],
]) {
  const from = (await firstDoll())[part];
  const towards = openingTowards(await firstDoll(), part, other);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + (towards.x * reach * i) / 12, from.y + (towards.y * reach * i) / 12);
    await wait(20);
  }
  // Held at its furthest for a moment before anything is read: the pointer has her knee pinned, so the
  // pose stays put, and both halves of the reading — the card and the step her machine reads — are then
  // looking at a pose that has stopped moving. Nothing about what is read below is about a frame.
  await wait(700);
  const pulled = await firstDoll();
  summary.pain[part] = {
    dragged: await portraits(),
    // ...and what her machine reads at the same moment: the step of the worst source, which a knee pulled
    // out from under her has to have put past *nothing*.
    machines: await machines(),
    thighs: Number(thighAngle(pulled).toFixed(1)),
    // How far her knee itself went: a doll lying on her own legs can be pulled a long way without the
    // angle *between* her thighs changing, and that angle is what the check below would otherwise
    // have to read as a failure of the pull rather than as the pose she fell into.
    moved: Number(Math.hypot(pulled[part].x - from.x, pulled[part].y - from.y).toFixed(1)),
  };
  await page.screenshot({ path: join(outDir, `18-split-${part}.png`) });
  await page.mouse.up();
  await wait(300);
}
summary.pain.settled = await portraits();

summary.inspect = await page.evaluate(() => window.__garden.inspect());
const drawn = summary.toolbar.drawn;
if (drawn.ropes !== 1) problems.push(`the rope tool drew ${drawn.ropes} ropes`);
if (summary.toolbar.ropeDrawing.onStage !== 1) {
  problems.push(
    `a rope on a live stage reads as ${JSON.stringify(summary.toolbar.ropeDrawing)} rather than one drawn rope`,
  );
}
if (!drawn.ropeHandles[0]?.tied) problems.push('the rope was not tied to the doll it was drawn from');
if (drawn.longestStretch > 1.05 + 1e-6) problems.push(`a rope stretched to ${drawn.longestStretch.toFixed(4)}`);
if (drawn.dolls !== 1) problems.push(`the stage has ${drawn.dolls} dolls before anything was put on it`);

// The hall: the world is drawn over `assets/bg-2.png` — the second location's own picture — and the sprite covers the world box exactly — it
// is stretched to `STAGE_WIDTH x STAGE_HEIGHT`, 1000x740 — so the picture is never cropped. The file
// is that size itself, so it is not squeezed either; a file of another shape would be (read below).
const hall = summary.inspect.background;
if (!/assets\/bg-2\.png$/.test(hall?.src ?? '')) {
  problems.push(`the world is drawn over ${hall?.src || 'nothing'}`);
}
if (hall?.width !== 1000 || hall?.height !== 740) {
  problems.push(`the hall covers ${hall?.width}x${hall?.height} world pixels, not 1000x740`);
}
// The file itself, however big it is, is stretched over the world box: that is what covering the world
// means. So a picture of another shape comes out flattened, and since nothing else in the game can see
// it — the sprite is the world's size either way — it is said out loud here. The port's own `bg-2.png`
// is the world's own 1000x740, so this is a note that should stay silent; it is the check that says so
// when the picture is replaced and the world is not.
const [hallTexelWidth, hallTexelHeight] = hall?.texels ?? [];
const flatten =
  hallTexelWidth && hallTexelHeight
    ? 1 - (summary.inspect.stage.height / hallTexelHeight) / (summary.inspect.stage.width / hallTexelWidth)
    : 0;
summary.hall = { texels: hall?.texels, flatten: Number(flatten.toFixed(4)) };
if (Math.abs(flatten) > 0.01) {
  console.log(
    `the hall is ${hallTexelWidth}x${hallTexelHeight} over a ${summary.inspect.stage.width}x${summary.inspect.stage.height} world: flattened by ${(flatten * 100).toFixed(1)}%`,
  );
}
// The world is never magnified: a world pixel is a CSS pixel at most, which is what keeps the girl's
// artwork — a texel per world pixel — exact on screen, instead of resampled upwards and soft. A window
// larger than the stage gets more black around the picture rather than a bigger doll (see
// `MAX_WORLD_SCALE` in `frontend/src/game/stage.ts`).
const drawnWorld = summary.layout.first.world;
if (drawnWorld.width > 1000 + 1 || drawnWorld.height > 740 + 1) {
  problems.push(
    `the world is drawn ${drawnWorld.width.toFixed(0)}x${drawnWorld.height.toFixed(0)} CSS pixels, more than its own 1000x740`,
  );
}
// And what she hits is not the picture's own edge but the box inside it: the walls stand
// `WALL_MARGIN_X`/`Y` world pixels in from the *picture's* edges — 136 and 163, the port's own numbers
// (`frontend/src/game/stage.ts`), which nothing in the picture marks — and they are as wide as the view leaves
// them (`wallsFor`), which on this window is narrower than the picture.
//
// Everything here is read back in world pixels through the *view* the renderer drew with: the scale
// between a world pixel and a CSS pixel, and which corner of the world the box's own corner is. The
// picture's own corners are off screen on a cropped world, so they are reconstructed from the view
// rather than measured off the drawing.
const firstView = summary.layout.first.view;
if (!firstView) problems.push('the renderer reported no view of the world at all');
/**
 * The walls of a reading, in world pixels: what the renderer drew, read back through the *view* the
 * window was drawn with — the picture's own corners are off screen on a cropped world, so they are
 * reconstructed from the view rather than measured off the drawing.
 */
function wallsOf(reading) {
  const { view, world: box, walls } = reading;
  const toWorldX = (canvasX) => view.left + (canvasX - box.x) / view.scale;
  const toWorldY = (canvasY) => view.top + (canvasY - box.y) / view.scale;
  const left = toWorldX(walls.x);
  const right = toWorldX(walls.x + walls.width);
  return {
    left,
    right,
    width: right - left,
    height: walls.height / view.scale,
    floor: toWorldY(walls.y + walls.height),
  };
}
const firstWalls = wallsOf(summary.layout.first);
const wallLeft = firstWalls.left;
const wallRight = firstWalls.right;
const wallFloor = firstWalls.floor;
const playArea = { width: firstWalls.width, height: firstWalls.height };
summary.walls = { left: wallLeft, right: wallRight, floor: wallFloor, ...playArea };
// The play area is 728 wide, always: the walls are the picture's own and do not follow the window
// (`stage.ts`), and it is asked of the *built* game here rather than of `stage.ts`.
const wantedWallWidth = 728;
if (Math.abs(playArea.width - wantedWallWidth) > 1) {
  problems.push(
    `a ${firstView.width.toFixed(0)} wide view left the walls ${playArea.width.toFixed(0)} wide, not ${wantedWallWidth}`,
  );
}
// The walls are centred on the picture and never closer to the picture's own edge than the scenery
// band the port has always kept there (136).
const scenery = 1000 / 2 - playArea.width / 2;
if (Math.abs(wallLeft + wallRight) > 1) {
  problems.push(`the walls stand at ${wallLeft.toFixed(1)}..${wallRight.toFixed(1)}, which is not centred on the picture`);
}
if (scenery < 136 - 0.5) {
  problems.push(
    `the walls come within ${scenery.toFixed(1)} world pixels of the picture's own edge, inside the 136 of scenery`,
  );
}
// The floor is the hall's own line, 163 above the foot of the picture whatever the window does with it:
// the picture may be cropped from the top, but the band of floor at its foot is what stays put.
summary.wallFloor = wallFloor;
if (Math.abs(wallFloor - 207) > 0.5) {
  problems.push(`the walls' floor is at y = ${wallFloor.toFixed(1)}, not the picture's own 207`);
}
if (Math.abs(playArea.height - 414) > 1) {
  problems.push(`the walls' box is ${playArea.height.toFixed(0)} tall, not the picture's own 414`);
}
// And it is the floor she really is stopped by, and the *only* thing stopping her: a rig with no thickness
// is laid out on that line (`World.layDown`), so every joint of hers is on it — the box they cover is a
// line, `lyingJoints.height` of it, with its lowest corner on the floor itself and her weight centred on
// it.
if (Math.abs(summary.settledY - wallFloor) > 10) {
  problems.push(
    `her centre of mass is at y = ${summary.settledY}, not on the wall's floor at ${wallFloor.toFixed(0)}`,
  );
}
if (summary.lyingJoints.height > 1) {
  problems.push(
    `her joints cover ${summary.lyingJoints.width}x${summary.lyingJoints.height} world pixels, not the one line a
    lying rig is`,
  );
}
if (Math.abs(summary.lyingJoints.lowest - wallFloor) > 1) {
  problems.push(
    `her lowest joint is at y = ${summary.lyingJoints.lowest}, not on the wall's floor at ${wallFloor.toFixed(0)}`,
  );
}
// ...and she is at *rest* there: the opening lays her out and lets go, so nothing about her is still
// moving. Read off her centre of mass, which is the one number gravity moves.
if (!(summary.lyingMove < 1)) {
  problems.push(`her centre of mass jumped ${summary.lyingMove.toFixed(2)} px between readings while she lay still`);
}
if (Math.abs(summary.lyingDrift) > 2) {
  problems.push(`she drifted ${summary.lyingDrift.toFixed(2)} px down the floor over three seconds of lying still`);
}
// The shadow under her: one per doll that casts one, `SHADOW_HEIGHT` world pixels tall, lying on the
// line the port draws shadows on — the wall's own floor `SHADOW_DROP` pixels lower, since her joints stop
// at the floor while the drawing of her hangs past them — and as wide as she is drawn, centred under her.
// Her width is read back off the sprites the renderer reports, the same way the shadow itself measures
// it: one drawn box per doll, in the world's own order, and every shadow has to belong to one of them.
//
// A doll held up in the air casts a fainter one, and one held high enough casts none at all — the shadow
// list is therefore at most as long as the list of dolls — so what is asked of every box in it is the
// rule rather than a count: its strength is the one her height asks for (`SHADOW_FADE_HEIGHT`).
const shadows = summary.inspect.shadows;
if (shadows.length > summary.inspect.dolls) {
  problems.push(`${summary.inspect.dolls} dolls cast ${shadows.length} shadows`);
}
/** The strength a shadow has at the height the renderer measured its doll at, as `scene.ts` works it. */
const strengthAt = (rise) => Math.min(1, Math.max(0, 1 - rise / 200));
// One drawn box per doll: the sprites are reported doll by doll, in the world's own order.
const spritesPerDoll = summary.inspect.parts.length / summary.inspect.dolls;
const drawnDolls = [];
for (let i = 0; i < summary.inspect.dolls; i++) {
  drawnDolls.push(drawnAcross(summary.inspect.parts.slice(i * spritesPerDoll, (i + 1) * spritesPerDoll)));
}
const shadowFloor = wallFloor + 40;
for (const shadow of shadows) {
  if (Math.abs(shadow.height - 50) > 0.5) problems.push(`a shadow is ${shadow.height.toFixed(1)} world pixels tall, not 50`);
  if (Math.abs(shadow.y + shadow.height - shadowFloor) > 0.5) {
    problems.push(
      `a shadow's foot is at y = ${(shadow.y + shadow.height).toFixed(1)}, not on the shadow's line at ${shadowFloor.toFixed(0)}`,
    );
  }
  const centre = shadow.x + shadow.width / 2;
  const mine = drawnDolls.find(
    (drawn) => Math.abs(centre - drawn.centre) <= 0.5 && Math.abs(shadow.width - drawn.width) <= 1,
  );
  if (!mine) {
    problems.push(
      `a shadow is drawn ${shadow.width.toFixed(0)} wide at ${centre.toFixed(1)}, which is under no doll at all`,
    );
  }
  // The strength it was drawn at: full for a doll resting on the floor, falling off with the height of
  // her lowest joint, and nothing left at 200 world pixels up. Her height is what the renderer measured
  // — her joints, not her drawing — so the relation is checked rather than re-derived here.
  const wanted = strengthAt(shadow.rise);
  if (Math.abs(shadow.alpha - wanted) > 0.02) {
    problems.push(
      `a shadow under a doll ${shadow.rise.toFixed(0)} pixels up the floor is drawn at ${shadow.alpha.toFixed(2)}, not ${wanted.toFixed(2)}`,
    );
  }
}

// The two readings that pin the fade down: lying on the floor at the start of the run, where a shadow is
// at its full strength, and up in the player's hand during the drag, where it is faint or gone entirely.
// Every sample of it has to be at the strength her own height asks for.
const samples = summary.shadowSamples;
if (samples.length === 0) problems.push('no shadow was read at all');
for (const sample of samples) {
  if (sample.rise === null) continue;
  if (Math.abs(sample.alpha - strengthAt(sample.rise)) > 0.02) {
    problems.push(
      `a shadow under a doll ${sample.rise.toFixed(0)} pixels up the floor is drawn at ${sample.alpha.toFixed(2)}`,
    );
  }
}
const high = samples.filter((sample) => sample.rise === null || sample.rise > 150);
if (high.length === 0) problems.push('the drag never took her high enough off the floor to lose her shadow');
if (high.some((sample) => sample.alpha > 0.3)) {
  problems.push(
    `a doll high off the floor casts a shadow at ${high.map((s) => s.alpha.toFixed(2)).join(', ')}`,
  );
}
const resting = samples.filter((sample) => sample.rise !== null && sample.rise < 5);
if (resting.length === 0) problems.push('she was never read lying on the floor with a shadow');
// A hair under 1 rather than exactly it: the solver leaves her joints a fraction of a pixel above the
// floor even when she is lying on it, and the fade is measured from them.
if (resting.some((sample) => sample.alpha < 0.97)) {
  problems.push(
    `a doll resting on the floor casts a shadow at ${resting.map((s) => s.alpha.toFixed(2)).join(', ')}`,
  );
}
// ...and the same rule for the reading the last of the run was taken at, with her hanging off a rope.
for (const shadow of summary.inspect.shadows) {
  if (Math.abs(shadow.alpha - strengthAt(shadow.rise)) > 0.02) {
    problems.push(
      `a shadow ${shadow.rise.toFixed(0)} pixels up the floor is drawn at ${shadow.alpha.toFixed(2)}`,
    );
  }
}

// The rule the toolbar promises: a tool is the player's to keep. Drawing a rope leaves the rope in
// hand, ready to draw another; the arrow stays the arrow through everything else — a knot dropped, a
// character put there through the engine's own call, a rope burned away — because nothing that goes on
// or comes off the stage is the bar's business (`World` changes the tool for nobody but the player).
const kept = {
  rope: summary.toolbar.toolAfterRope,
  arrow: summary.toolbar.toolAfterArrow,
  character: summary.toolbar.toolAfterDoll,
  'character again': summary.toolbar.toolAfterSecondDoll,
  burn: summary.toolbar.toolAfterBurn,
};
if (kept.rope !== 'rope') {
  problems.push(`drawing a rope left the toolbar holding ${kept.rope ?? 'nothing'} rather than the rope`);
}
for (const [what, tool] of Object.entries(kept)) {
  if (what === 'rope') continue;
  if (tool !== 'drag') problems.push(`the toolbar was left holding ${tool} rather than the arrow after the ${what}`);
}

// The knot that was carried should have gone exactly as far as the hand carried it, plus what the
// edge assist carried it on top — no further, which is what being anchored against the camera's pan
// means (`Game.grab`): the pan that follows her along the hall is not motion of the hand, and none of
// it may end up in where the knot is dropped; the assist's own carrying is motion *for* the hand and
// is counted in by its own tally. The doll should have come along with it too: that is what holding
// a rope by one end does.
const handTravel = {
  x: (knotTarget.x - knot.x) / (grabWorld?.scale || 1),
  y: (knotTarget.y - knot.y) / (grabWorld?.scale || 1),
};
if (!dropWorld || !grabWorld) problems.push('the rope lost its knots');
else {
  const assisted = dropWorld.carried - grabWorld.carried;
  const off = Math.hypot(
    dropWorld.x - grabWorld.x - handTravel.x - assisted,
    dropWorld.y - grabWorld.y - handTravel.y,
  );
  summary.toolbar.knotCarriedOff = off;
  if (off > 5) problems.push(`the carried knot did not go where the hand carried it (${off.toFixed(1)} px off)`);
}
const hauled = summary.toolbar.hauledHerBy;
if (!hauled || Math.hypot(hauled.x, hauled.y) < 40) {
  problems.push(`hauling the rope barely moved her (${Math.hypot(hauled?.x ?? 0, hauled?.y ?? 0).toFixed(1)} px)`);
}

// The bar is a pile of buttons at the world's own left edge, standing on the foot of it: the arrow first,
// which is the tool that used to be the whole of the game, the rope under it, and the chat last — the one
// button of the three that picks no tool, and the one at the very foot of the picture, so the way into the
// chat is in the bottom left corner of the world. Where the bar *is* is a claim about the world as well as
// the page, and it is checked with the layout.
const bar = summary.toolbar.layout;
if (JSON.stringify(bar.map((button) => button.tool)) !== JSON.stringify(['drag', 'rope', 'chat'])) {
  problems.push(`the bar holds ${JSON.stringify(bar.map((button) => button.tool))}`);
}
if (bar.some((button, i) => i > 0 && (button.top <= bar[i - 1].top || button.left !== bar[i - 1].left))) {
  problems.push(
    `the buttons do not run down the corner: ${bar.map((button) => `${button.left},${button.top}`).join(' ')}`,
  );
}
// ...and they are a pile rather than three buttons strung down the world: each stands the same distance
// under the one above it (a button is 44 px and the gap is 8), the chat's included — it used to be pushed
// down the whole height of the world away from the other two, and it is the next one under the rope now.
const pitch = bar.length > 1 ? bar[1].top - bar[0].top : 0;
if (bar.some((button, i) => i > 0 && Math.abs(button.top - bar[i - 1].top - pitch) > 1)) {
  problems.push(
    `the buttons are not evenly piled: ${bar.map((button) => button.top).join(', ')}`,
  );
}
if (Math.abs(pitch - (bar[0].width + 8)) > 1) {
  problems.push(`the buttons stand ${pitch} px apart, not a button and the 8 px gap (${bar[0].width + 8})`);
}
// ...and the first of them hangs from the top of the world, one inset in, which is what pinning the
// bar down is (the frame's own height is the world's, and the column inside it is laid out from that
// head — see `hudFrame`).
const barHead = bar[0].top;
const worldHead = chatStrip.world.y + chatStrip.hud.scale * 12;
if (Math.abs(barHead - worldHead) > 1) {
  problems.push(`the bar's buttons start at ${barHead}, not hanging from the top of the world (${worldHead.toFixed(1)})`);
}
// Every tool is a black square with a drawing the colour of the hall's own wood in it — the bar lies
// over the hall, so the dark square is what tells a button from the picture under it — edged with
// the same wood (`--wood`, whatever the page is wearing it as), and the one the player is holding is
// the same square the other way round: wood with a dark drawing and a dark edge. Nothing of the
// square itself changes under the pointer: what a hover adds is the word beside it, which is not the
// square.
const activeTools = bar.filter((button) => button.active);
if (activeTools.length !== 1 || activeTools[0].tool !== 'drag') {
  problems.push(`the bar has ${activeTools.length} active buttons, and the tool in hand is the arrow`);
}
for (const button of bar) {
  const wanted = button.active
    ? { background: palette.wood, colour: 'rgb(0, 0, 0)', edge: 'rgb(0, 0, 0)' }
    : { background: 'rgb(0, 0, 0)', colour: palette.wood, edge: palette.wood };
  if (button.background !== wanted.background || button.colour !== wanted.colour) {
    problems.push(
      `the ${button.tool} button is ${button.colour} on ${button.background}` +
        `, not ${wanted.colour} on ${wanted.background}` +
        `${button.active ? ' while it is the one in hand' : ''}`,
    );
  }
  if (button.borderWidth !== 2 || button.borderColour !== wanted.edge) {
    problems.push(
      `the ${button.tool} button is edged ${button.borderWidth}px of ${button.borderColour}, not 2px of ${wanted.edge}`,
    );
  }
}
// A card wears the rounding a button wears, measured against its own size: the one corner a card rounds
// and the bar are the same kind of thing, so they are rounded to the same proportion of themselves.
const barRounding = bar[0] ? bar[0].radius / bar[0].width : 0;
for (const card of summary.portraits.first.cards) {
  const cardRounding = card.radius / card.width;
  if (Math.abs(cardRounding - barRounding) > 0.01) {
    problems.push(
      `a card is rounded by ${(cardRounding * 100).toFixed(1)}% of itself, a button by ${(barRounding * 100).toFixed(1)}%`,
    );
  }
}
// Each of those squares wears its own word, and the words are the bar's three — the arrow's, the rope's and
// the chat's — said beside the square and only while the pointer is on it. The word is the button's own name
// in the markup as well, which is what a screen reader reads out, and it does not cover the button: it
// stands off the right edge of the square, level with the middle of it, inside the world. It is not a
// control either — no pointer of its own — so whatever stands under it (the hall, or the chat's own four
// lines for the two lower buttons) is what a press there lands on.
const barWords = ['Таскать', 'Связывать', 'Чатъ'];
const hints = summary.toolbar.hints ?? {};
const restWords = (hints.rest ?? []).map((hint) => hint.word);
if (JSON.stringify(restWords) !== JSON.stringify(barWords)) {
  problems.push(`the bar's own words are ${JSON.stringify(restWords)}, not ${JSON.stringify(barWords)}`);
}
if ((hints.rest ?? []).some((hint) => hint.shown)) {
  problems.push('a word of the bar is up with the pointer nowhere on the bar');
}
for (const tool of ['drag', 'rope', 'chat']) {
  const read = hints[tool] ?? [];
  const shown = read.filter((hint) => hint.shown).map((hint) => hint.tool);
  if (shown.length !== 1 || shown[0] !== tool) {
    problems.push(`with the pointer on the ${tool} the bar wears ${JSON.stringify(shown)}`);
  }
  const hint = read.find((entry) => entry.tool === tool);
  if (!hint) {
    problems.push(`the ${tool}'s button wears no word`);
    continue;
  }
  if (hint.name !== hint.word) {
    problems.push(`the ${tool}'s button is named \u00ab${hint.name}\u00bb and wears \u00ab${hint.word}\u00bb`);
  }
  if (Math.abs(hint.gap - 8) > 1) {
    problems.push(`the ${tool}'s word stands ${hint.gap.toFixed(1)} px off its button, not 8`);
  }
  if (Math.abs(hint.level) > 1) {
    problems.push(`the ${tool}'s word stands ${hint.level.toFixed(1)} px off the middle of its button`);
  }
  if (!hint.inside) problems.push(`the ${tool}'s word is drawn outside the world`);
  if (hint.clicks !== 'none') problems.push(`the ${tool}'s word takes pointers of its own (${hint.clicks})`);
  if (hint.overItself) problems.push(`a press at the ${tool}'s word lands on the word itself`);
  // ...and it is drawn as a small button of the bar: the same black square with the same wood in it, edged
  // with that wood, and rounded by the same fraction of itself that a button is of itself.
  if (hint.background !== 'rgb(0, 0, 0)' || hint.colour !== palette.wood) {
    problems.push(`the ${tool}'s word is ${hint.colour} on ${hint.background}`);
  }
  if (hint.borderWidth !== 2 || hint.borderColour !== palette.wood) {
    problems.push(`the ${tool}'s word is edged ${hint.borderWidth}px of ${hint.borderColour}, not 2px of the wood`);
  }
  if (Math.abs(hint.radius / hint.height - barRounding) > 0.01) {
    problems.push(
      `the ${tool}'s word is rounded by ${((hint.radius / hint.height) * 100).toFixed(1)}% of itself, a button by ${(barRounding * 100).toFixed(1)}%`,
    );
  }
}
// ...and it is really drawn: the middle of a card is the picture, and the pixel one in from the card's own
// corner is not — a rounded card has the hall behind it there, and a square one would be showing its own
// picture. What the corner is held against is the card's own middle rather than a hall pixel beside it:
// the hall is a photograph with edges of its own, and two pixels a few apart in the bottom right corner of
// it stand further from each other than any slack worth writing down — the rounding is a claim about the
// card, and it is read off the card.
const cardPixels = summary.layout.first.pixels?.card;
if (!cardPixels) problems.push('no card was read off the first screenshot');
else {
  const differs = (a, b, slack) => a.some((value, i) => Math.abs(value - b[i]) > slack);
  if (!differs(cardPixels.corner, cardPixels.face, 12)) {
    problems.push(
      `a card's corner is rgb(${cardPixels.corner.join(',')}), the picture itself, so the card is not rounded`,
    );
  }
  if (!differs(cardPixels.face, cardPixels.hall, 12)) {
    problems.push('the middle of a card is the hall, so no picture was drawn on it');
  }
}

// What the stage holds once the engine's own calls have put it there: three dolls, and the
// rope drawn among them.
const afterAdd = summary.toolbar.afterAdd;
if (afterAdd.dolls !== 3) problems.push(`the stage holds ${afterAdd.dolls} dolls, not the three that were put on it`);

// Her own machine, over the run: the step of the worst source it last read, per doll, and the face it
// decided to wear. The machine is the pose *as the built game reads it* — that a pose is worth a step is
// a claim about the rig, asked where the world can be held still (`frontend/tests/pain.test.ts`), and what the
// machine does with the steps over time is asked in `frontend/tests/pain-state.test.ts`; what is checked here is
// that the built game feeds it and that the card never drops below the step it reads.
const opened = summary.machines.first;
if (opened.some((machine) => machine.worst !== 0)) {
  problems.push(`the pose she is put down in is read as ${opened.map((m) => m.worst).join(', ')}`);
}
if (opened.some((machine) => machine.restNeeded)) {
  problems.push('the doll wants a rest before anything has happened to her');
}

// The strip and the machine, over the whole run: every reading of the pose is one the card has to be at
// or above — the arrival face outlives the pose that earned it, which is the whole of `pain-state.ts`.
for (const [label, reading] of [
  ['the pull of her first knee', summary.pain.knee1],
  ['the pull of her second knee', summary.pain.knee2],
]) {
  checkCardAgainstStep(label, reading.dragged.cards, reading.machines);
}
// ...and the same for a pose made while the world was *paused*: this one is not allowed to come out empty,
// since the legs were swung back far enough to be read on the hips' own ladder.
if (summary.pausedPose.worst < 1) {
  problems.push(`a pose made while paused reads as ${summary.pausedPose.worst}`);
}

// Three dolls on the stage, the newest two of them put there by the engine's own call, so they are the
// default character. Every doll's sprites are drawn at their own size: the tile's density lives in the
// texture, and a scale creeping back in would take the parts off the body.
if (afterAdd.dollCharacters[2]?.id !== 'elena') {
  problems.push(`the third doll is ${afterAdd.dollCharacters[2]?.id ?? 'not there'}`);
}
if (afterAdd.longestStretch > 1.05 + 1e-6) {
  problems.push(`a rope stretched to ${afterAdd.longestStretch.toFixed(4)}`);
}
const spritesPerDollAdded = summary.inspectAdded.parts.length / afterAdd.dolls;
if (!Number.isInteger(spritesPerDollAdded) || spritesPerDollAdded !== spritesPerDoll) {
  problems.push(
    `three dolls were drawn with ${summary.inspectAdded.parts.length} sprites (${spritesPerDoll} each when there were two)`,
  );
}
for (const sprite of summary.inspect.parts) {
  if (sprite.scaleX !== 1) problems.push(`a part sprite is drawn at scale ${sprite.scaleX}`);
  // One texel of the artwork is one world pixel — the density the movie draws its bitmaps at and the
  // one `tools/prepare-assets.mjs` bakes them at (see `docs/assets.md`). A bake at another density, or
  // a sprite that scales its texture instead of trusting it, comes out here: the doll would be drawn
  // at the wrong size and nothing else in the game would notice.
  if (sprite.texels[0] !== sprite.width || sprite.texels[1] !== sprite.height) {
    problems.push(
      `a part of ${sprite.texels.join('x')} texels is drawn over ${sprite.width}x${sprite.height} world pixels`,
    );
  }
}
// The rope the arrow took away: the pointer over the middle of its cord wore the crosshair that offered
// it, the press landed on the world point read off its own handle, and the rope left the world the
// moment the press returned (`World.press`) — the picture of it going is the renderer's own, played out
// with the world standing still and then dropped rather than drawn at nothing. The ends of the cord are
// not offered that way: those are the knots the arrow carries about, and the hand is what the pointer
// wears over one (`Rope.middleDistance`).
const burn = summary.toolbar.burn;
if (!burn) {
  problems.push('the rope was never hovered or pressed, so nothing was burnt');
} else {
  if (summary.toolbar.cursorOverRope !== 'crosshair') {
    problems.push(
      `the pointer over the middle of a rope wears ${summary.toolbar.cursorOverRope || 'nothing'} ` +
        'rather than the crosshair that offers it',
    );
  }
  if (summary.toolbar.cursorOverKnot !== 'grab') {
    problems.push(
      `the pointer over a knot wears ${summary.toolbar.cursorOverKnot || 'nothing'}, not the hand that carries it`,
    );
  }
  if (summary.toolbar.cursorAfterBurn === 'crosshair') {
    problems.push('the crosshair still stands where the rope was');
  }
  if (burn.ropes !== 0 || summary.toolbar.afterBurn?.ropes !== 0) {
    problems.push(`the press left ${summary.toolbar.afterBurn?.ropes} ropes on the stage`);
  }
  if (burn.bursts.length !== 1) {
    problems.push(`the rope was taken off the stage with ${burn.bursts.length} bursts of it`);
  } else {
    const burst = burn.bursts[0];
    if (burst.nodes !== doomed.ropeNodes) {
      problems.push(`a rope of ${doomed.ropeNodes} joints was taken away as a burst of ${burst.nodes}`);
    }
    const off = Math.hypot(burst.x - burn.meant.x, burst.y - burn.meant.y);
    if (off > 1.5) problems.push(`the burst opens ${off.toFixed(1)} px from where the press landed`);
    // The ring the burst opens with is its own wavefront, and it is nine times as quick as the rest of the
    // burst: it has its own time — a ninth of the burst's — so by a tenth of the way in it is already as
    // far out as it ever goes, and everything after that is the light of it going out (`RING_SECONDS`,
    // `RING_START`/`RING_REACH` in `scene.ts`). Read twice for that: once a frame or two after the press,
    // where it is still snatching open, and once a quarter of a second in, where it has to be at its full
    // reach — the burst is still burning there, but the ring has long since arrived.
    const reach = 7 + 96;
    const later = summary.toolbar.burnLater?.[0];
    if (!later) {
      problems.push('the burst was over before its ring could be read twice');
    } else {
      if (Math.abs(later.ring - reach) > 0.2 || !(later.age < 0.62)) {
        problems.push(
          `the ring is ${later.ring.toFixed(1)} px out at ${later.age.toFixed(2)} s, not the whole of its ` +
            `${reach} px inside a burst of 0.62 s`,
        );
      }
      if (burst.age < 0.04 && !(burst.ring < reach)) {
        problems.push(
          `the ring was already out at its full ${burst.ring.toFixed(1)} px ${burst.age.toFixed(2)} s after the press`,
        );
      }
    }
  }
  if (summary.toolbar.afterBurst !== 0) {
    problems.push('the burst was still being drawn a second after the rope was taken away');
  }
}
// A press on a doll, which is what the stage has always done with one: she is taken hold of rather than
// taken away, and the stage is what it was — the only thing a press can spend is a rope, and there is
// none left to spend (`World.press` reaches a doll to hold her particles and no further).
const afterDollClick = summary.toolbar.afterDollClick;
if (afterDollClick.dolls !== 3) {
  problems.push(`a press on a doll took her off the stage (${afterDollClick.dolls} of 3 left)`);
}
if (afterDollClick.ropes !== 0) {
  problems.push(`a press on a doll put ${afterDollClick.ropes} ropes on the stage`);
}

// The strip in the world's own bottom right corner: one card per doll, a bare portrait and nothing else,
// hung off the world's right edge, and drawn under the world rather than over it. What a *pose* is
// worth is asked of the doll in `frontend/tests/pain.test.ts`, where the world can be held still: out here she is
// lying on the floor from the first frame, and the first card is read while the world is already
// running.
const strip = summary.portraits.first;
const world = strip.world;
if (strip.cards.length !== 1) problems.push(`the strip has ${strip.cards.length} cards for one doll`);
const firstCard = strip.cards[0] ?? {};
if (firstCard.name !== 'Елена') problems.push(`the first card is ${firstCard.name ?? 'not there'}`);
if (!Number.isInteger(firstCard.portrait) || firstCard.portrait < 0 || firstCard.portrait > 7) {
  problems.push(`the first card shows portrait ${firstCard.portrait}`);
}
// The card is exactly the picture: nothing is added to it, and the strip hangs off the world's own
// bottom right corner *flush* with it — no inset at all, so the card in the corner is the corner of the
// picture, the one part of the interface the world's own edges are the edges of.
if (firstCard.height > firstCard.width * 1.5 + 1) {
  problems.push(`a card is ${firstCard.width}x${firstCard.height}, taller than a portrait`);
}
const fromRight = world.x + world.width - (firstCard.x + firstCard.width);
if (Math.abs(fromRight) > 1) {
  problems.push(`the single card stands ${fromRight.toFixed(1)} px in from the world's right edge, not on it`);
}
const fromFoot = world.y + world.height - (firstCard.y + firstCard.height);
if (Math.abs(fromFoot) > 1) {
  problems.push(
    `the strip's own foot is ${fromFoot.toFixed(1)} px above the world's, not on it ` +
      `(a card's foot is at ${(firstCard.y + firstCard.height).toFixed(1)}, the world's at ${(world.y + world.height).toFixed(1)})`,
  );
}
// The one corner a card rounds is the one the picture has not got, and this window is wider than it is
// tall, so the strip is in the world's own bottom right and that corner is a card's top left
// (`CardCorner` in `scene.ts`; what is *drawn* there is read off the screenshot above).
const stripCanvas = summary.layout.first.canvas;
if (!(stripCanvas.cssWidth > stripCanvas.cssHeight)) {
  problems.push(
    `the corner a card rounds was read in a ${stripCanvas.cssWidth}x${stripCanvas.cssHeight} window, not a wide one`,
  );
}
if (summary.portraits.first.cards.some((card) => card.corner !== 'top-left')) {
  problems.push(
    `a card in the world's bottom right corner is rounded on ${summary.portraits.first.cards
      .map((card) => card.corner)
      .join(', ')}, not its top left`,
  );
}

const added = summary.portraits.added;
const stripCharacters = added.cards.map((card) => card.name);
if (JSON.stringify(stripCharacters) !== JSON.stringify(['Елена', 'Елена', 'Елена'])) {
  problems.push(`the strip shows ${JSON.stringify(stripCharacters)}`);
}
const cardGaps = added.cards.slice(1).map((card, i) => card.x - (added.cards[i].x + added.cards[i].width));
// 1rem between two cards, measured in the cards' own pixels: the strip is laid out at the size the
// portraits were baked at — 120x180 — until the world is too narrow to hold it, and then card and gap
// are shrunk together (see `Scene.syncPortraits`), so the gap to expect is 16 of those pixels.
const gapWanted = (16 * (added.cards[0]?.width ?? 120)) / 120;
if (cardGaps.some((gap) => Math.abs(gap - gapWanted) > 1)) {
  problems.push(
    `cards stand ${cardGaps.map((gap) => gap.toFixed(1)).join(', ')} px apart, not ${gapWanted.toFixed(1)}`,
  );
}
const stripLeft = Math.min(...added.cards.map((card) => card.x));
const stripRight = Math.max(...added.cards.map((card) => card.x + card.width));
const cornerGap = added.world.x + added.world.width - stripRight;
if (Math.abs(cornerGap) > 1) {
  problems.push(`the strip ends ${cornerGap.toFixed(1)} px in from the world's right edge, not on it`);
}

// The interface is part of the world rather than of the window: the bar hangs off the world's own left
// edge, 12 px in, and its three buttons stand on the world's own foot, while the strip of portraits hangs
// off the world's own bottom right corner *on* its two edges — so nothing is ever drawn out on the black.
//
// The bar is real DOM, so this is read twice over and the readings have to agree: the renderer says
// where the world's corner is, and the browser says where the bar ended up — a CSS box placed by the
// page's own layout is a thing only the browser can be asked about.
const started = summary.layout.first;
const hud = started.hud;
if (Math.abs(hud.x - (started.world.x + 12)) > 0.5 || Math.abs(hud.y - (started.world.y + 12)) > 0.5) {
  problems.push(`the interface hangs off ${hud.x.toFixed(1)}, ${hud.y.toFixed(1)} instead of the world's corner`);
}
if (hud.scale !== 1) {
  problems.push(
    `a ${started.canvas.cssWidth}x${started.canvas.cssHeight} window shrank the interface to ${hud.scale}`,
  );
}
// ...and it is as tall as the world is, less the two insets: that is the frame the row inside it is laid
// out in, so it is the height of the frame — not of the bar — that stands the bar's buttons on the world's
// own foot (`hudFrame` in `scene.ts`).
if (Math.abs(hud.height - (started.world.height - 24)) > 1) {
  problems.push(
    `the interface is ${hud.height.toFixed(0)} px tall in a world ${started.world.height.toFixed(0)} px tall`,
  );
}
// ...and as wide as the world across, less those same two insets: the frame is the foot the tape's own bar is
// centred on and measured against (`TapeTimeline.vue`), so a frame that stopped short of the world's right edge
// would put that bar off the middle of the picture it belongs to.
if (Math.abs(hud.width - (started.world.width - 24)) > 1) {
  problems.push(
    `the interface is ${hud.width.toFixed(0)} px wide in a world ${started.world.width.toFixed(0)} px wide`,
  );
}
if (JSON.stringify(started.layers) !== JSON.stringify(['hall', 'portraits', 'world'])) {
  problems.push(`the canvas is drawn in the order ${JSON.stringify(started.layers)}, not hall, cards, world`);
}
if (!started.bar) {
  problems.push('the bar is not on the page');
} else {
  if (Math.abs(started.bar.x - hud.x) > 0.5) {
    problems.push(`the bar is drawn at x = ${started.bar.x}, not at the world's own left edge`);
  }
  // ...and its own head is the frame's own head: the three buttons are the whole of the bar, and they
  // hang from the top of the frame — the world's own corner one inset in, at whatever the window shrank
  // the interface to.
  if (Math.abs(started.bar.y - hud.y) > 0.5) {
    problems.push(
      `the bar's buttons start at ${started.bar.y.toFixed(0)}, not hanging from the interface's own head ` +
        `(${hud.y.toFixed(0)})`,
    );
  }
  if (started.bar.width > 60) {
    problems.push(`the bar is ${started.bar.width.toFixed(0)} px wide, so it is not a stack of buttons`);
  }
  if (started.bar.width > started.world.width || started.bar.height > started.world.height) {
    problems.push('the bar is wider or taller than the world it is in');
  }
  // ...and the browser's own box is nothing but the pile: three 44 px buttons with the 8 px gaps between
  // them, however tall the frame they are laid out in is.
  if (Math.abs(started.bar.height - barStack) > 1) {
    problems.push(
      `the bar is laid out ${started.bar.height.toFixed(0)} px tall, not the ${barStack} of its three buttons`,
    );
  }
  // The strip grows leftwards towards the bar and stops clear of it — the bar is one narrow stack of buttons
  // at the foot of the world, so the strip has the whole of the world's own foot to grow along.
  const barRight = started.bar.x + started.bar.width;
  if (stripLeft - barRight < 15) {
    problems.push(`the strip reaches x = ${stripLeft.toFixed(1)}, up against the bar's ${barRight.toFixed(1)}`);
  }
}

// Everything outside the world is black: the canvas is cleared to it and the page is painted with it,
// so the hall reads as a picture hanging in the dark and the frame the window leaves around it — the
// movie's own 20% and the window's own letterbox — cannot be told apart. The colour is read twice over:
// from the page, and from the pixels of a screenshot, which is the only thing that can say a colour
// survived all the way to the screen. This window is smaller than the hall, so there is no black in it
// at all — every corner of the canvas is the picture (see the big window below for the frame).
if (started.backdrop !== 0) problems.push(`the canvas is cleared to #${started.backdrop.toString(16)}`);
const pageColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
if (pageColor !== 'rgb(0, 0, 0)') problems.push(`the page behind the canvas is painted ${pageColor}`);
const painted = [started.pixels?.corner ?? [], started.pixels?.farCorner ?? [], ...(started.pixels?.edges ?? [])];
for (const [i, pixel] of painted.entries()) {
  if (pixel.join() === '0,0,0') {
    problems.push(`the world leaves the backdrop at the canvas' own edge (${i}), where the picture should be`);
  }
}

// The strip shows what the doll's own machine is wearing, and every card the run read has to be drawn
// from the picture that face asks for — the face and the artwork must not drift apart. A face whose
// picture the artwork does not have is drawn with the worst picture that it does, so the two are
// compared through the cards this character actually brought (see `Scene.cardArt`). What the machine
// itself does over time is asked of it in `frontend/tests/pain-state.test.ts`, and which step a pose is worth in
// `frontend/tests/pain.test.ts`, where the world can be held still.
//
// The character's portraits on disk: the eight numbered ones the machine's scale is written in, and the
// breather, which is not a step of that scale at all and so has a name rather than a number (`FACE.rest`
// in `pain-state.ts`, `REST_PORTRAIT` in `characters.ts`).
const portraitDir = join(root, 'frontend', 'dist', 'assets', 'characters', 'elena', 'portrait');
const files = readdirSync(portraitDir);
const pictures = files
  .map((name) => Number(name.replace(/\.png$/, '')))
  .filter((index) => Number.isInteger(index))
  .sort((a, b) => a - b);
const pictureFor = (face) => {
  const below = pictures.filter((index) => index <= face);
  return below.length ? below[below.length - 1] : (pictures[0] ?? -1);
};
if (pictures.length === 0) problems.push('the character brought no portraits at all');
/** The number the doll's machine wears the breather under: `FACE.rest`, past the eight numbered faces. */
const REST_FACE = 8;
/**
 * What a face names and the file it is drawn from, in a pair, as `Scene.dressCard` picks both.
 *
 * The breather is the one face whose art is not the file of its own number: it is `rest.png` when the
 * character brought one, and the lull's own picture when it did not — which is the fallback the scene
 * warns about, and the reason this cannot be written as one `endsWith` over a number.
 */
const artFor = (face) => {
  if (face !== REST_FACE) return { art: pictureFor(face), file: `${pictureFor(face)}.png` };
  if (files.includes('rest.png')) return { art: REST_FACE, file: 'rest.png' };
  return { art: pictureFor(1), file: `${pictureFor(1)}.png` };
};

for (const reading of [
  strip,
  added,
  summary.pain.calm,
  summary.pain.arch.front,
  summary.pain.arch.back,
  summary.pain.knee1.dragged,
  summary.pain.knee2.dragged,
  summary.pain.settled,
]) {
  for (const card of reading.cards) {
    const { art, file } = artFor(card.portrait);
    if (card.art !== art) {
      problems.push(`portrait ${card.portrait} is drawn with picture ${card.art}, not ${art}`);
    }
    if (!String(card.src).endsWith(`/portrait/${file}`)) {
      problems.push(`picture ${card.art} is drawn from ${card.src || 'nothing'}, not ${file}`);
    }
  }
}

// A pose that hurts nothing is read as nothing — the doll the movie authored, lying where she fell — and
// a pose made while the world stands still is still read: the card and the machine have to be about the
// same pose whatever the pause is doing. Both are in `World.observe`, which is what a paused world does
// instead of stepping (`Game.frame`), and the whole reading is verified in `frontend/tests/pain.test.ts`.
const pausedPose = summary.pausedPose;
if (!pausedPose.agreed) {
  problems.push(
    `a pose made while paused is worth ${pausedPose.worst} and her card is ${pausedPose.cards[0]?.portrait}`,
  );
}

// The two head pulls are here to exercise the strip and to be looked at, not to claim a number: a
// ragdoll lying on the floor obeys nothing — her back may well point straight into it, so a pull can
// push her head nowhere at all, and gravity straightens her as readily as a pull bends her. What the
// numbers came to is in the log and in the two screenshots; what they *must* come to is
// `frontend/tests/pain.test.ts`'s business, where a pose can be built by hand and held still. The claim this
// run does make about them is the one every reading above had to satisfy: the picture on a card is the
// level that card's own pain asks for.
const calm = summary.pain.calm.cards[0] ?? {};
const pulledFront = summary.pain.arch.front.cards[0] ?? {};
const pulledBack = summary.pain.arch.back.cards[0] ?? {};

// The split: her knees were pulled apart, so the angle between her thighs has changed and the strip
// has to have followed her. What the legs end up doing is up to the ragdoll — the model's own answer
// for a full split is asked of it in `frontend/tests/pain.test.ts`, where a pose can be built by hand.
if (!(Math.abs(summary.pain.knee2.thighs - summary.pain.thighs) > 2) && !(summary.pain.knee2.moved > 10)) {
  problems.push(
    `pulling her knees apart left her thigh angle at ${summary.pain.thighs} -> ${summary.pain.knee2.thighs} with her knee moved ${summary.pain.knee2.moved} px`,
  );
}

// The stage keeps a margin of its own from the edges of the canvas, so that the doll lying on the
// floor is not cropped by the window. What is measured is the box that is really drawn — the *visible*
// slice of the world (`inspect.world`), which on a small window is not the whole hall — since that is
// the box the picture fills and the interface is laid out inside.
// The world is drawn onto the canvas' own edges: this window is narrower and shorter than the hall, so
// there is nothing to spare and nothing black between the picture and the window (a window *bigger* than
// the hall is the case with a frame — see the big window below).
const firstWorld = summary.layout.first.world;
const canvas = summary.inspect.canvas;
if (
  Math.abs(firstWorld.x) > 0.5 ||
  Math.abs(firstWorld.y) > 0.5 ||
  Math.abs(firstWorld.width - canvas.cssWidth) > 0.5 ||
  Math.abs(firstWorld.height - canvas.cssHeight) > 0.5
) {
  problems.push(
    `a ${canvas.cssWidth}x${canvas.cssHeight} window draws the world at ` +
      `${firstWorld.x.toFixed(0)}, ${firstWorld.y.toFixed(0)} ${firstWorld.width.toFixed(0)}x${firstWorld.height.toFixed(0)}, not onto its own edges`,
  );
}
// ...and the world is where the window's own middle says it is: what the picture does not fill is black
// on both sides of it, evenly (a big window gets black around the hall rather than a bigger doll).
const view = summary.layout.first.view;
if (Math.abs(view.x - (canvas.cssWidth - firstWorld.width) / 2) > 0.5) {
  problems.push(`the world is drawn at x = ${view.x.toFixed(1)}, not centred in the canvas`);
}
if (Math.abs(view.y - (canvas.cssHeight - firstWorld.height) / 2) > 0.5) {
  problems.push(`the world is drawn at y = ${view.y.toFixed(1)}, not centred in the canvas`);
}
// A window that is not the hall's own size shows a slice of the hall rather than a smaller one: the
// scale stays 1, and the slice is as big as the room there was. This is the window the run plays in
// (900x700), where the picture is cropped at both sides and along the top.
const firstCanvas = summary.layout.first.canvas;
if (view.scale !== 1) {
  problems.push(`a ${firstCanvas.cssWidth}x${firstCanvas.cssHeight} window drew the world at scale ${view.scale}`);
}
if (Math.abs(view.width - firstCanvas.cssWidth) > 1 || Math.abs(view.height - firstCanvas.cssHeight) > 1) {
  problems.push(
    `a ${firstCanvas.cssWidth}x${firstCanvas.cssHeight} window shows ${view.width.toFixed(0)}x${view.height.toFixed(0)} world pixels, not the room it has`,
  );
}
if (view.top + view.height !== 370) {
  problems.push(`the visible slice of the world ends at ${(view.top + view.height).toFixed(1)}, not at the picture's own foot`);
}

// A window small enough that the world cannot hold the interface at its own size: the whole of it —
// the bar, the gap and the cards — shrinks with the world rather than being drawn out on the black.
// What has to hold is what held at the window's own size: everything inside the world's box, which on
// this window is the whole canvas. The bar is DOM, so this is also what says the page follows the
// renderer when the window changes under it.
await page.setViewport({ width: 200, height: 200, deviceScaleFactor: 1 });
await wait(400);
const small = await layout();
summary.layout.small = small;
await page.screenshot({ path: join(outDir, '20-small-window.png') });
const smallCards = small.cards;
const inside = (box, into) =>
  box.x >= into.x - 0.5 &&
  box.y >= into.y - 0.5 &&
  box.x + box.width <= into.x + into.width + 0.5 &&
  box.y + box.height <= into.y + into.height + 0.5;
if (!(small.hud.scale < 1)) {
  problems.push(
    `a ${small.canvas.cssWidth}x${small.canvas.cssHeight} window did not shrink the interface (${small.hud.scale})`,
  );
}
// A window too small for the smallest world zooms out instead of closing in: the whole of it is drawn,
// at a scale below 1, with the margin around it and nothing cropped away — the doll is small, but she
// is still whole, and so is the room. What is asked is the *floor* of the rule: the view is never
// narrower or shorter than the smallest world, however tight the window is.
if (!(small.view.scale < 1)) {
  problems.push(
    `a ${small.canvas.cssWidth}x${small.canvas.cssHeight} window drew the smallest world at scale ${small.view.scale}`,
  );
}
if (!(small.view.width >= 400 - 1 && small.view.height >= 400 - 1)) {
  problems.push(
    `a ${small.canvas.cssWidth}x${small.canvas.cssHeight} window shows ${small.view.width.toFixed(0)}x${small.view.height.toFixed(0)} world pixels, less than the smallest world`,
  );
}
if (small.view.top + small.view.height !== 370) {
  problems.push('the smallest world is not the foot of the picture, so its floor moved with it');
}
if (!(inside(small.world, { x: 0, y: 0, width: small.canvas.cssWidth, height: small.canvas.cssHeight }))) {
  problems.push('the smallest world is drawn outside the canvas');
}
if (!small.bar) {
  problems.push('the bar left the page when the window was made small');
} else if (!inside(small.bar, small.world)) {
  problems.push(`the bar at ${small.bar.x.toFixed(0)}, ${small.bar.y.toFixed(0)} is not inside the small world`);
}
if (smallCards.length === 0) {
  problems.push('the strip lost its cards when the window was made small');
} else if (!smallCards.every((card) => inside(card, small.world))) {
  problems.push('a card is outside the small world');
}
const smallCorner = small.world.x + small.world.width - Math.max(...smallCards.map((card) => card.x + card.width));
if (Math.abs(smallCorner) > 1) {
  problems.push(`the strip ends ${smallCorner.toFixed(1)} px in from the small world's right edge, not on it`);
}
// The bar is DOM drawn at the world's scale, so its buttons have to be clickable where they are drawn
// and not where CSS would have put them unscaled: the rope is picked from the small bar, and put back.
await page.click('[data-tool="rope"]');
await wait(150);
const smallTool = await page.evaluate(() => window.__garden.overview().tool);
if (smallTool !== 'rope') {
  problems.push(`clicking the shrunken bar picked ${smallTool} instead of the rope`);
}
await page.click('[data-tool="drag"]');
await wait(150);

// And a window big enough that the world would be magnified if it could be: the fit stops at
// `MAX_WORLD_SCALE`, so the world is drawn at exactly its own size — one CSS pixel per world pixel, which
// is one per texel of the girl — and everything the window has left over is black around the picture.
// This is the size the game is meant to be looked at in: the artwork is exact here, and a smaller window
// only crops or shrinks it.
await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
await wait(400);
const big = await layout();
summary.layout.big = big;
await page.screenshot({ path: join(outDir, '21-big-window.png') });
if (
  Math.abs(big.world.width - summary.inspect.stage.width) > 1 ||
  Math.abs(big.world.height - summary.inspect.stage.height) > 1
) {
  problems.push(
    `a ${big.canvas.cssWidth}x${big.canvas.cssHeight} window draws the world at ` +
      `${big.world.width.toFixed(0)}x${big.world.height.toFixed(0)}, not its own ` +
      `${summary.inspect.stage.width}x${summary.inspect.stage.height}`,
  );
}
// This is the one window in the run that gets a frame, so it is the one the frame is read from: black at
// the window's own corner, black in the band the world leaves around the picture, and the picture itself
// where the world is — the whole of the rule, in four pixels.
const bigShot = decodePng(readFileSync(join(outDir, '21-big-window.png')));
const insideWorld = pixelOf(bigShot, big.world.x + big.world.width / 2, big.world.y + 4);
const besideWorld = pixelOf(bigShot, big.world.x - 8, big.world.y + big.world.height / 2);
// The band above the picture is read *above its left corner*, not above the middle of it: the room is taller
// than the picture — the ceiling stands `CEILING_MARGIN` above the visible top — so a doll flung up there is
// drawn outside the picture by design, and the middle of the band is exactly the lane she comes down. What
// the band is being asked about is the backdrop behind her, which is the same black wherever it is read.
const aboveWorld = pixelOf(bigShot, big.world.x + 8, big.world.y - 8);
const bigCorner = pixelOf(bigShot, 2, 2);
summary.layout.big.pixels = { insideWorld, besideWorld, aboveWorld, corner: bigCorner };
for (const [where, pixel] of [
  ['the window\'s own corner', bigCorner],
  ['the band beside the picture', besideWorld],
  ['the band above the picture', aboveWorld],
]) {
  if (pixel.join() !== '0,0,0') problems.push(`${where} is rgb(${pixel.join()}, ...), not the backdrop`);
}
if (insideWorld.join() === '0,0,0') problems.push('a window bigger than the hall painted nothing inside it');

// A window that is narrow but tall: the world is cropped at the sides and keeps the whole of its
// height — and the walls behind it stay the one room's, whatever the window shows of them.
await page.setViewport({ width: 520, height: 900, deviceScaleFactor: 1 });
await wait(400);
const narrow = await layout();
summary.layout.narrow = narrow;
await page.screenshot({ path: join(outDir, '22-narrow-window.png') });
if (narrow.world.height < narrow.view.height - 1) {
  problems.push(`a tall window shows only ${narrow.view.height.toFixed(0)} of the world's 740`);
}
if (Math.abs(narrow.view.height - 740) > 1) {
  problems.push(`a ${narrow.canvas.cssHeight} px tall window shows ${narrow.view.height.toFixed(0)} world pixels of height`);
}
const narrowWalls = wallsOf(narrow);
if (Math.abs(narrowWalls.width - 728) > 0.5) {
  problems.push(`a narrow window left the walls ${narrowWalls.width.toFixed(0)} wide rather than the room's 728`);
}
summary.walls.narrow = narrowWalls;
if (Math.abs(narrowWalls.floor - 207) > 0.5) {
  problems.push(`a narrow window moved the walls' floor to ${narrowWalls.floor.toFixed(1)}`);
}
// ...and a window taller than it is wide moves the strip of portraits out of the room she falls through:
// the cards hang off the world's own *top right* corner instead of its bottom right one — flush with the
// top edge of the picture and with its right one — and the one corner a card rounds turns over with them:
// a card's bottom right now (`CardCorner` in `scene.ts`). The world's top right is the one corner of the
// picture the strip can be flush with on both of its edges, since the picture's left edge is the bar's —
// the buttons own that edge, and the room they take along it is kept clear of the cards — and a card
// standing there would be a card drawn over the buttons.
if (!(narrow.canvas.cssHeight > narrow.canvas.cssWidth)) {
  problems.push(
    `a ${narrow.canvas.cssWidth}x${narrow.canvas.cssHeight} window is not the upright one this is about`,
  );
}
const narrowCards = narrow.cards;
if (narrowCards.length === 0) {
  problems.push('the upright window lost the strip of portraits');
} else {
  const offTop = Math.min(...narrowCards.map((card) => card.y - narrow.world.y));
  if (Math.abs(offTop) > 1) {
    problems.push(
      `a card in an upright window stands ${offTop.toFixed(1)} px under the world's top edge, not on it`,
    );
  }
  const offRight =
    Math.max(...narrowCards.map((card) => card.x + card.width)) - (narrow.world.x + narrow.world.width);
  if (Math.abs(offRight) > 1) {
    problems.push(
      `a card in an upright window ends ${(-offRight).toFixed(1)} px in from the world's right edge, not on it`,
    );
  }
  const barRight = narrow.bar ? narrow.bar.x + narrow.bar.width : 0;
  const fromBar = Math.min(...narrowCards.map((card) => card.x)) - barRight;
  if (narrow.bar && !(fromBar > 0)) {
    problems.push(`a card in an upright window reaches ${(-fromBar).toFixed(1)} px into the bar, over the buttons`);
  }
  const uprightCorners = narrowCards.map((card) => card.corner);
  if (uprightCorners.some((corner) => corner !== 'bottom-right')) {
    problems.push(`a card in an upright window is rounded on ${uprightCorners.join(', ')}, not its bottom right`);
  }
  const outside = narrowCards.filter(
    (card) => card.x < narrow.world.x - 0.5 || card.x + card.width > narrow.world.x + narrow.world.width + 0.5,
  );
  if (outside.length > 0) {
    problems.push(`a card in an upright window is drawn at x = ${outside[0].x.toFixed(1)}, outside the world`);
  }
}

// And a window that is short but wide: the picture is cropped from the *top*, so the foot of it — the
// floor the doll lands on, the band of stone under her and the shadows lying on it — stays exactly
// where it was, and the world does not run off the bottom of the screen.
await page.setViewport({ width: 1000, height: 440, deviceScaleFactor: 1 });
await wait(400);
const short = await layout();
summary.layout.short = short;
await page.screenshot({ path: join(outDir, '23-short-window.png') });
const shortWalls = wallsOf(short);
const shortFloor = short.view.top + short.view.height;
if (Math.abs(shortFloor - 370) > 1e-6) {
  problems.push(`a short window moved the foot of the picture to y = ${shortFloor.toFixed(1)}`);
}
summary.walls.short = shortWalls;
if (Math.abs(shortWalls.floor - 207) > 0.5) {
  problems.push(`a short window moved the walls' floor to ${shortWalls.floor.toFixed(1)}`);
}
if (!(short.view.height >= 400 - 1)) {
  problems.push(`a ${short.canvas.cssHeight} px tall window shows ${short.view.height.toFixed(0)} world pixels of height`);
}
if (short.view.y + short.view.height * short.view.scale > short.canvas.cssHeight) {
  problems.push('the foot of the picture is drawn past the bottom of the canvas');
}
if (Math.abs(short.view.y + short.view.height * short.view.scale - short.canvas.cssHeight) > 0.5) {
  problems.push('the foot of the picture is not on the bottom edge of the canvas');
}
if (short.view.top <= -370 + 1) {
  problems.push(`a short window did not crop the top of the picture (it starts at ${short.view.top.toFixed(0)})`);
}

// The ceiling: the fourth wall of the world, and the only one that is never in the picture. The port's
// room is closed on all four sides — three of them are the hall's own walls, and the fourth stands
// `CEILING_MARGIN` (200 world pixels, `stage.ts`) above the top of the picture, out of the frame far
// enough that it is a wall rather than a lid on the drawing. A doll hauled up there is stopped by it
// instead of leaving the world for good, and comes back down when let go.
//
// She is flung up by hand, since nothing in the run can haul her that far into the air: the
// pointer's reach is the visible picture (`World.onStage`), and a rope pulled hard enough to get her up
// there is a whole scene of its own. Verlet reads the distance a particle moved as the speed it leaves
// with, so a hand's width of the old position is an upward fling — and the opening's slow pace, a fifth
// of the movie's, is set aside for the flight. That is the second place in this run that says so out
// loud; the first is the fall that follows it, and both are put back before the run ends.
await page.setViewport({ width: 1000, height: 780, deviceScaleFactor: 1 });
await wait(400);
const ceilingView = await layout();
summary.layout.ceiling = ceilingView;
const ceiling = await page.evaluate(() => {
  const game = window.__garden;
  const doll = game.world.dolls[0];
  const speedBefore = game.engine.speed;
  game.engine.speed = 1;
  for (const p of doll.particles) p.oldy += 400;
  // Fast-forwarded by hand: the world's own fall is the movie's own slow one, and this run wants her at
  // the ceiling inside the timeout. The real loop keeps stepping in between, which is the game's own doing.
  let steps = 0;
  let up = false;
  while (steps < 4000 && !up) {
    game.world.step(16);
    steps++;
    up = doll.particles.some((p) => p.clamped && p.y <= game.engine.miny + 1);
  }
  // ...and a few hundred steps more with her held up there by hand — the pointer on the ceiling line, a
  // hand on every joint, which is what a rope holding her against it amounts to.
  const middle = { x: doll.centre.x, y: doll.centre.y };
  game.engine.mouseX = middle.x;
  game.engine.mouseY = game.engine.miny;
  game.engine.onHold = [...doll.particles];
  for (let i = 0; i < 240; i++) game.world.step(16);
  const stillUp = doll.particles.some((p) => p.clamped && p.y <= game.engine.miny + 1);
  game.engine.onHold = null;
  return {
    steps,
    up,
    speedBefore,
    stillUp,
    inHand: game.engine.onHold ? game.engine.onHold.length : 0,
    mouse: { x: game.engine.mouseX, y: game.engine.mouseY },
    clamped: doll.particles.filter((p) => p.clamped).length,
    joints: doll.particles.length,
    herTop: Math.min(...doll.particles.map((p) => p.y)),
    ceiling: game.engine.miny,
    floor: game.engine.maxy,
    left: game.engine.minx,
    right: game.engine.maxx,
    centre: middle,
    herLowest: Math.max(...doll.particles.map((p) => p.y)),
  };
});
summary.ceiling = ceiling;
const pictureTop = ceilingView.view.top;
// A strip of sky `CEILING_MARGIN` deep (200 world pixels) over the top of the picture.
if (Math.abs(ceiling.ceiling - (pictureTop - 200)) > 1) {
  problems.push(
    `the ceiling stands at ${ceiling.ceiling.toFixed(0)} with the top of the picture at ${pictureTop.toFixed(0)}`,
  );
}
if (!ceiling.up) {
  problems.push(`a doll flung up out of the picture never reached the ceiling in ${ceiling.steps} steps`);
}
if (!ceiling.stillUp) {
  problems.push(
    `the doll did not stay against the ceiling she was flung at (her joints at y = ` +
      `${ceiling.herTop.toFixed(0)}..${ceiling.herLowest.toFixed(0)} with the ceiling at ${ceiling.ceiling.toFixed(0)}, ` +
      `${ceiling.clamped} of her ${ceiling.joints} joints clamped, ` +
      `${ceiling.inHand} in a hand at ${ceiling.mouse.x.toFixed(0)}, ${ceiling.mouse.y.toFixed(0)})`,
  );
}

// What the ceiling was for: she comes back down. She is a particle of the engine as always, so she comes
// down at her own pace and stops on the walls' own floor — the fling above is undone by the fall below,
// and the world is left as a resting one for the tape section. How long that takes is the movie's own
// pace, so it is stepped out by hand again.
const fallen = await page.evaluate(() => {
  const game = window.__garden;
  for (let i = 0; i < 1500; i++) game.world.step(16);
  const doll = game.world.dolls[0];
  return {
    floor: game.engine.maxy,
    left: game.engine.minx,
    right: game.engine.maxx,
    herTop: Math.min(...doll.particles.map((p) => p.y)),
    herLowest: Math.max(...doll.particles.map((p) => p.y)),
    inHand: game.engine.onHold ? game.engine.onHold.length : 0,
    inside: doll.particles.every(
      (p) => p.x >= game.engine.minx - 1 && p.x <= game.engine.maxx + 1 && p.y <= game.engine.maxy + 1,
    ),
  };
});
summary.fallen = fallen;
await wait(250);
await page.screenshot({ path: join(outDir, '26-fallen.png') });
if (!(fallen.herLowest > ceiling.herLowest + 100)) {
  problems.push(
    `she came down only ${(fallen.herLowest - ceiling.herLowest).toFixed(0)} px out of the ${ceiling.ceiling.toFixed(0)} she was up at ` +
      `(her joints at y = ${fallen.herTop.toFixed(0)}..${fallen.herLowest.toFixed(0)}, ${fallen.inHand} in a hand)`,
  );
}
if (!fallen.inside) problems.push('the doll ended up outside the room she was flung about in');

// Back to the pace the run played at.
await page.evaluate((speed) => {
  window.__garden.engine.speed = speed;
}, ceiling.speedBefore);
// The tape: a run written down while it is being played, and then played back. What is checked here is the
// promise the whole feature makes — that she does *exactly* what she did — and what it rests on: the rows
// the recording writes are the joints and the cards of every step of the run, on the quarter-pixel grid,
// and a playback is those rows put back in order with no simulation in it at all. There is no drift to
// measure because there is nothing to drift: the rows *are* the run, and what the walls and the stage
// rest on is that the world is one fixed room on every screen — the window may be resized under the run
// and the file never hears about it.
await page.evaluate(() => window.__garden.unload());
await wait(120);
const beforeTape = await page.evaluate(() => ({
  report: window.__garden.tapeState,
  timeline: document.querySelector('.tape') !== null,
  // The bar of tools has no buttons for the tape any more: a run begins by itself (`Game.pressAt`), and what
  // plays one back is the tape's own bar (`TapeTimeline.vue`) — so neither is on the bar, and neither is
  // anywhere else on the page while nothing is on the timeline.
  tapeButtons: document.querySelectorAll('[data-action="record"], [data-action="play"]').length,
  walls: window.__garden.engine.maxx,
}));
if (beforeTape.report.loaded || beforeTape.timeline) {
  problems.push('a timeline is up before anything was recorded');
}
if (beforeTape.tapeButtons !== 0) {
  problems.push(`the bar of tools has ${beforeTape.tapeButtons} tape buttons on it`);
}

// Nothing starts a run any more: the first touch of a doll does (`Game.pressAt`), which is the drag below. What
// is checked first is the other half of that promise — a world nobody has touched is not a run.
const untouched = await page.evaluate(() => ({
  recording: window.__garden.tapeState.recording,
  live: window.__garden.liveHead(),
}));
if (untouched.recording || untouched.live !== null) {
  problems.push('a run was being written before anything was touched');
}

// A run worth recording: a doll put on the stage through the engine's own door (so the stage she arrives
// on travels with the run), taken by the middle and dragged about, the window resized *under her* mid-run
// — which the tape never hears about, the world being one fixed room — and dragged on for another second.
//
// The new doll is waited for first: she is put down in her authored pose and settles into the floor fast,
// and a press aimed at where her middle *was* a round trip ago is a press that misses her — which would
// leave the section without a run at all. Her centre, read twice half a second apart, is what "settled" is.
const centreOfLastDoll = () =>
  page.evaluate(() => {
    const dolls = window.__garden.world.dolls;
    const doll = dolls[dolls.length - 1];
    return doll ? doll.centre.y : Number.NaN;
  });
await page.evaluate(() => window.__garden.addDoll());
{
  let was = await centreOfLastDoll();
  for (let i = 0; i < 40 && Number.isFinite(was); i++) {
    await wait(500);
    const now = await centreOfLastDoll();
    if (Math.abs(now - was) < 0.01) break;
    was = now;
  }
}
const taped = await page.evaluate(() => window.__garden.overview().dollHandles.at(-1));
/** What the touch of her started: read at the press below, and kept for the summary. */
let touched = null;
if (!taped) {
  problems.push('the tape section found no doll to drag');
} else {
  await page.mouse.move(taped.x, taped.y);
  await page.mouse.down();
  // The touch is what starts the run (`Game.pressAt`): the hand takes hold of the particles of her within
  // `sqrt(1500)` of the point, and a hand on a doll is a run being written. What the run is opened with is the
  // head of a tape that has no steps in it yet — the four things a tape says about itself, and nothing else,
  // which is exactly what the server takes (`readHead` in `backend/internal/api`) and all it can be told
  // before a step has happened.
  touched = await page.evaluate(() => {
    const head = window.__garden.liveHead();
    return { recording: window.__garden.tapeState.recording, head: head === null ? null : Object.keys(head).sort() };
  });
  if (!touched.recording || !touched.head || touched.head.join() !== 'format,seed,stage,step') {
    problems.push(`touching a doll did not start a run (${JSON.stringify(touched)})`);
  }
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(taped.x + i * 7, taped.y - i * 5);
    await wait(40);
  }
  // The window is resized under her mid-run, and the one thing that must not happen is the room hearing
  // about it: the walls are the picture's own on every screen, and a run recorded through a resize is a
  // run of the same one room all the way through.
  const wallsBeforeResize = await page.evaluate(() => window.__garden.engine.maxx);
  await page.setViewport({ width: 820, height: 660, deviceScaleFactor: 1 });
  await wait(150);
  const wallsAfterResize = await page.evaluate(() => window.__garden.engine.maxx);
  if (wallsAfterResize !== wallsBeforeResize) {
    problems.push(`a resized window moved the walls: ${wallsBeforeResize} then ${wallsAfterResize}`);
  }
}
const wallsWhileRecording = await page.evaluate(() => ({
  maxx: window.__garden.engine.maxx,
  step: window.__garden.tapeState.step,
}));
if (taped) {
  for (let i = 17; i <= 32; i++) {
    await page.mouse.move(taped.x + i * 7, taped.y - i * 5);
    await wait(40);
  }
  await page.mouse.up();
  await wait(300);
}
// The arrow keys turn the engine's clock, which changes the run's own pace in the middle of it: what a
// tape carries is the rows the paced world wrote, so the pace is in them for good.
await page.keyboard.down('ArrowRight');
await wait(400);
await page.keyboard.up('ArrowRight');
await wait(200);
// The run is ended here rather than by a button, because there is no button for it: a run in progress is ended
// by the page going away (`useLiveRun`), and what *this* section needs is the run on the timeline, which is the
// engine's own door (`Game.stopRecording`). The run that was being sent goes with it.
await page.evaluate(() => window.__garden.stopRecording());
await wait(250);

// The run that was just played went to the server as it was played: opened once, with the head of a tape that
// has nothing in it yet and the name this page plays under, and then handed over a second at a time — the
// slices numbered from zero, each of them worth at least one step, and the last of them saying the run is over
// (`useLiveRun`). What the *server* makes of them is `backend/internal/store`; what a window makes of the tape
// they add up to is the list's own business (`useRuns`), and the next thing a section of this run has to cover.
const live = chatLive.opened.at(-1);
if (!live) {
  problems.push('the run that was played was never opened on the server');
} else {
  const head = Object.keys(live.head ?? {}).sort().join();
  if (head !== 'format,seed,stage,step') problems.push(`the run was opened with "${head}" in its head`);
  if (live.author !== player.nick) problems.push(`the run was opened as "${live.author}"`);
  if (!live.slices.length) problems.push('the run arrived with no slices at all');
  // The one slice that may be empty is the last: the ending goes out whatever it has to carry, and a page
  // closed a moment after its final second sends nothing but the word (`useLiveRun.end`).
  if (
    !live.slices.every(
      (one, at) => Number.isInteger(one.steps) && (one.steps >= 1 || (one.last && at === live.slices.length - 1)),
    )
  ) {
    problems.push('a slice of the run arrived with no steps in it');
  }
  if (!live.ended) problems.push('the run was never finished on the server');
  if (chatLive.refused.length) problems.push(`${chatLive.refused.length} slices were refused by the server`);
  summary.liveRun = {
    id: live.id,
    name: live.name,
    author: live.author,
    slices: live.slices.length,
    numbered: live.slices.map((one) => one.seq).join(),
    steps: live.slices.reduce((total, one) => total + one.steps, 0),
    ended: live.ended,
  };
}

const recorded = await page.evaluate(() => {
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  };
  const timeline = document.querySelector('.tape');
  const slider = timeline?.querySelector('.tape__slider');
  return {
    report: window.__garden.tapeState,
    walls: window.__garden.engine.maxx,
    timeline: timeline ? box(timeline) : null,
    world: window.__garden.inspect().world,
    hud: window.__garden.hud(),
    slider: slider ? { max: Number(slider.max), value: Number(slider.value) } : null,
    // The tape is a *player's* bar and nothing on it reads a run out any more: no clock drawn, no reading of what a
    // run is worth, no save button — that is the debug panel's, and even with the desk up it is not here. What the
    // clock said is not lost, it is *said* rather than shown: the slider carries the position and the length as
    // `aria-valuetext`, since a slider that reads out a step count of 437 of 1150 says nothing about a run.
    clock: document.querySelector('.tape__clock') !== null,
    readout: slider?.getAttribute('aria-valuetext') ?? '',
    close: timeline?.querySelector('.tape__close')?.textContent?.trim() ?? '',
    // ...and while the bar is up the game's own row is not on the page at all: a run on the tape is a run being
    // *watched*, and the tools and the chat have given the foot of the world up to the bar (`App.vue`).
    tools: document.querySelector('.toolbar') !== null,
    chat: document.querySelector('.chat-strip') !== null,
    readings: timeline?.querySelectorAll('.tape__reading').length ?? 0,
    saves: timeline?.querySelectorAll('[data-action="save"]').length ?? 0,
    // The tape's own play button, which is the only one there is while a run is loaded: the bar of tools' pair of
    // tape buttons went with the row.
    playPressed: timeline?.querySelector('.tape__play')?.getAttribute('aria-pressed'),
  };
});
summary.tape = { beforeTape, untouched, touched, wallsWhileRecording, recorded };
await page.screenshot({ path: join(outDir, '24-tape-recorded.png') });

if (!recorded.report.loaded || recorded.report.recording) {
  problems.push(`the recording did not leave a tape on the timeline (${JSON.stringify(recorded.report)})`);
}
if (recorded.report.steps < 60) {
  problems.push(`the recorded run is only ${recorded.report.steps} steps long`);
}
if (recorded.readings !== 0) problems.push(`the timeline has ${recorded.readings} readings on it`);
if (recorded.saves !== 0) problems.push('the timeline still has a save button on it');
if (!recorded.timeline) {
  problems.push('stopping the recording left no timeline on the page');
} else {
  if (!inside(recorded.timeline, recorded.world)) {
    problems.push(
      `the timeline at ${recorded.timeline.x.toFixed(0)}, ${recorded.timeline.y.toFixed(0)} ` +
        `${recorded.timeline.width.toFixed(0)}x${recorded.timeline.height.toFixed(0)} is not inside the world`,
    );
  }
  // The foot of the world is where the bar's own buttons stand, and the tape's bar stands on the same edge:
  // what says it is anchored to the bottom of the picture rather than floating somewhere in the middle of it
  // is that its own foot is the world's, less the inset the whole interface keeps from the world's edges
  // (`HUD_INSET`).
  const foot = recorded.timeline.y + recorded.timeline.height;
  const wanted = recorded.world.y + recorded.world.height - 12 * recorded.hud.scale;
  if (Math.abs(foot - wanted) > 2) {
    problems.push(`the timeline's own foot is ${(wanted - foot).toFixed(1)} px above the world's`);
  }
  // ...and it is a button tall, since the play button in it is one of the game's own tools.
  if (Math.abs(recorded.timeline.height - 44 * recorded.hud.scale) > 1) {
    problems.push(
      `the tape's bar is ${recorded.timeline.height.toFixed(0)} px tall rather than a button's ` +
        `${(44 * recorded.hud.scale).toFixed(0)}`,
    );
  }
  // ...and centred on the *world* rather than on the window: the frame it is laid out in is the world's own box
  // (`Scene.hud`), so the middle of the bar is the middle of the picture whatever the window is doing.
  const middle = recorded.timeline.x + recorded.timeline.width / 2;
  const frameMiddle = recorded.hud.x + (recorded.hud.width * recorded.hud.scale) / 2;
  if (Math.abs(middle - frameMiddle) > 1) {
    problems.push(`the tape's bar is ${(middle - frameMiddle).toFixed(1)} px off the middle of the world`);
  }
  // ...and it keeps a card's worth of room clear at either end of itself, since the strip of portraits stands on
  // the world's own feet: a bar that reached them would cover one.
  if (recorded.timeline.width > recorded.hud.width * recorded.hud.scale - 240 + 1) {
    problems.push(
      `the tape's bar is ${recorded.timeline.width.toFixed(0)} px wide, so it is into the cards ` +
        `(${(recorded.hud.width * recorded.hud.scale).toFixed(0)} px of frame, 240 px of cards)`,
    );
  }
}
// While the bar is up it is the whole of the interface's row: the tools and the chat are not on the page, and what
// ends the mode is a word at the end of the bar rather than a cross in its corner.
if (recorded.tools || recorded.chat) {
  problems.push('the bar of tools and the chat are still up while a run is on the tape');
}
if (recorded.close !== 'Закрыть') {
  problems.push(`the way out of the tape reads "${recorded.close}"`);
}
if (recorded.slider?.max !== recorded.report.steps || recorded.slider?.value !== recorded.report.steps) {
  problems.push(
    `the slider is at ${recorded.slider?.value} of ${recorded.slider?.max} with the playhead at ` +
      `${recorded.report.step} of ${recorded.report.steps} at the end of a recording`,
  );
}
// The clock is not on the bar, and what it said is on the slider instead: it is what a player who cannot see the
// slider move has to go by (`TapeTimeline.vue`).
if (recorded.clock) {
  problems.push('the tape still draws a clock of its own');
}
if (!/\d:\d\d\.\d \/ \d:\d\d\.\d/.test(recorded.readout)) {
  problems.push(`the slider reads out "${recorded.readout}"`);
}
if (recorded.playPressed !== 'false') {
  problems.push(`the playback button reads pressed before anything was played (${recorded.playPressed})`);
}

// What the tape costs as a file: a run is JSON rather than video, and this is the number that says what that
// costs. A tape is the run's own rows — a small list of whole numbers a step of a dragged doll, and one
// whole number per stillness — plus the stage it started from, once. The bound below is where a format
// regression would show: absolute positions rather than deltas, decimals rather than the quarter-pixel
// grid, or a row filed for every step of a lying-still doll rather than the one pause the stillness is.
const tapeFile = await page.evaluate(() => window.__garden.tapeJson());
if (!tapeFile) {
  // Everything from here on is about that run's file: the run the section needed never happened (the
  // problem was said at its touch), so this run of the smoke ends here rather than read a tape that is
  // not there — with the summary and the problems it had collected so far.
  problems.push('the recorded run left no tape on the timeline');
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ ...summary, problems }, null, 2));
  console.log('problems:', problems.length, problems.join('; '));
  process.exit(1);
}
const tapeBytes = Buffer.byteLength(tapeFile, 'utf8');
// The tape itself is kept as well as the summary: it is a file of a run, and what it is worth is that it can be
// played again by something else — the tests do exactly that (`frontend/tests/tape.test.ts` reads this shape).
writeFileSync(join(outDir, 'tape.json'), tapeFile);
const recordedTape = JSON.parse(tapeFile);
const tapeSeconds = ((recordedTape.steps ?? 0) * 20) / 1000;
const tapeBytesPerSecond = tapeBytes / tapeSeconds;
// The records cover exactly the length the tape says it is, and no two pauses sit next to each other:
// those two invariants are what makes a slice of a run paste onto the run at all.
const coveredBy = (records) =>
  (records ?? []).reduce((total, record) => total + (typeof record === 'number' ? record : 1), 0);
const wholeNumbers = (records) =>
  (records ?? []).every(
    (record) => typeof record === 'number' || (Array.isArray(record) && record.every((n) => Number.isInteger(n))),
  );
let previousWasPause = false;
for (const record of recordedTape.frames ?? []) {
  if (typeof record === 'number' && previousWasPause) {
    problems.push('the tape carries two pauses next to each other, which a recorder never writes');
    break;
  }
  previousWasPause = typeof record === 'number';
}
summary.tape.recordedTape = {
  steps: recordedTape.steps,
  records: recordedTape.frames?.length ?? 0,
  pauses: (recordedTape.frames ?? []).filter((record) => typeof record === 'number').length,
  edits: recordedTape.edits?.length ?? 0,
  bytes: tapeBytes,
  bytesPerSecond: tapeBytesPerSecond,
};
if (recordedTape.format !== 'garden-tape/2') {
  problems.push(`the tape says it is ${recordedTape.format}`);
}
if (coveredBy(recordedTape.frames) !== recordedTape.steps) {
  problems.push(
    `the tape's records cover ${coveredBy(recordedTape.frames)} of the ${recordedTape.steps} steps it says it is`,
  );
}
if (!wholeNumbers(recordedTape.frames)) {
  problems.push('the tape carries something other than whole numbers in its rows');
}
// The old format's own fields have no business in a file of this one: an `events` list would be a second
// opinion about the run the rows already are.
for (const field of ['events', 'keys', 'body']) {
  if (Object.hasOwn(recordedTape, field)) {
    problems.push(`the tape carries an "${field}" field of the old format`);
  }
}
// A row costs what its cast costs, so the budget is per doll: a dragged doll is the busiest a doll
// gets, and a whole busy second of one is a few kilobytes of one- and two-figure deltas.
const tapeDolls = Math.max(1, recordedTape.stage?.dolls?.length ?? 1);
const tapeBytesPerDollSecond = tapeBytesPerSecond / tapeDolls;
summary.tape.recordedTape.dolls = tapeDolls;
summary.tape.recordedTape.bytesPerDollSecond = tapeBytesPerDollSecond;
if (!(tapeBytesPerDollSecond < 4096)) {
  problems.push(
    `the tape costs ${(tapeBytesPerDollSecond / 1024).toFixed(1)} kB a second per doll ` +
      `(${tapeBytes} bytes over ${recordedTape.steps} steps of ${tapeDolls} dolls)`,
  );
}
// The playback, watched from the beginning in a window that is nothing like the one the run was made in —
// the run was played in a resized one — which is what makes the walls check below mean something: the
// room is the same one whatever the window, so the playback's walls are the recording's walls.
await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
await wait(200);
const watching = await page.evaluate(() => ({
  walls: window.__garden.engine.maxx,
  world: window.__garden.inspect().world,
}));
if (Math.abs(watching.walls - (wallsWhileRecording.maxx ?? 0)) > 0.001) {
  problems.push(
    `the watching window's walls stand at ${watching.walls} rather than the one room's ${wallsWhileRecording.maxx}`,
  );
}
await page.evaluate(() => window.__garden.play());
await wait(600);
const playing = await page.evaluate(() => {
  const inspect = window.__garden.inspect();
  return {
    report: window.__garden.tapeState,
    // The bar's own play button, which is the tool's own pair of buttons' counterpart — and, while a run is on the
    // tape, the only one on the page: the row it used to sit in is not there (`App.vue`).
    pressed: document.querySelector('.tape__play')?.getAttribute('aria-pressed'),
    walls: window.__garden.engine.maxx,
    // The world a run walks holds no ropes at all: a tape is the dolls' picture, and the player's own
    // ropes come back with their scene when the tape comes off (`Game.unload`).
    ropes: inspect.ropes.length,
  };
});
await page.screenshot({ path: join(outDir, '25-tape-playing.png') });
if (!playing.report.playing || playing.pressed !== 'true') {
  problems.push(`the playback did not start (${JSON.stringify(playing.report)})`);
}
if (playing.ropes !== 0) problems.push('the world a playback walks carries ropes of its own');
if (playing.report.step <= 0) problems.push('the playback did not move the playhead on');
if (playing.report.step >= playing.report.steps) {
  problems.push('the playback was already at the end a moment after it started');
}
// Six seconds is a good deal longer than any run this section records, so the run is over by the time it is up.
await wait(6000);
const played = await page.evaluate(() => {
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  };
  const timeline = document.querySelector('.tape');
  const slider = timeline?.querySelector('.tape__slider');
  return {
    report: window.__garden.tapeState,
    walls: window.__garden.engine.maxx,
    world: window.__garden.inspect().world,
    dolls: window.__garden.world.dolls.length,
    timeline: timeline ? box(timeline) : null,
    slider: slider ? Number(slider.value) : null,
    // The bar is up for as long as a run is loaded on it, and so is the *mode*: the tools stay out of the way once
    // the playback has stopped, since what follows a run is dragging its playhead about rather than the game.
    close: timeline?.querySelector('.tape__close')?.textContent?.trim() ?? '',
    tools: document.querySelector('.toolbar') !== null,
    readings: timeline?.querySelectorAll('.tape__reading').length ?? 0,
    saves: timeline?.querySelectorAll('[data-action="save"]').length ?? 0,
  };
});
summary.tape.playing = playing;
summary.tape.played = played;
summary.tape.watching = watching;
summary.tape.bytes = tapeBytes;
await page.screenshot({ path: join(outDir, '26-tape-played.png') });

if (played.report.playing || played.report.step !== played.report.steps) {
  problems.push(
    `the playback ended at step ${played.report.step} of ${played.report.steps} ` +
      `(playing: ${played.report.playing})`,
  );
}
// The mode outlasts the playback: a run that has stopped walking is still a run to drag the playhead about, so the
// bar stays up and the tools stay away — what brings them back is the word at the end of the bar.
if (played.tools) problems.push('the bar of tools came back the moment the playback stopped');
if (played.close !== 'Закрыть') problems.push(`the way out of the tape reads "${played.close}"`);
// And the room: the one room there is, on the window that watched the playback as much as the one that
// recorded the run — the resize under the run reached the picture and never the physics.
if (Math.abs(played.walls - wallsWhileRecording.maxx) > 0.001) {
  problems.push(
    `the playback kept her inside walls at ${played.walls} rather than the one room's ` +
      `${wallsWhileRecording.maxx}`,
  );
}
if (played.slider !== played.report.steps) {
  problems.push(`the slider came to rest at ${played.slider} with the playhead at ${played.report.steps}`);
}
if (played.readings !== 0) problems.push(`the timeline has ${played.readings} readings on it`);
if (played.saves !== 0) problems.push('the timeline grew a save button back on it');
if (!played.timeline || !inside(played.timeline, played.world)) {
  problems.push('the timeline left the world while the run was playing');
}
// The whole point of the feature, read straight off the file: the last row the run wrote is the pose the
// playback ends standing in, quarter-pixel for quarter-pixel — a playback is the rows, and the rows are
// the run, so the world the playback leaves standing is the world the recording ended in.
{
  const lastRow = await page.evaluate(() => {
    const game = window.__garden;
    const dolls = game.world.dolls;
    const row = [];
    for (const doll of dolls) {
      for (const p of doll.particles) row.push(Math.round(p.x * 4), Math.round(p.y * 4));
      row.push(doll.pain.shown);
    }
    return row;
  });
  const recordedRows = [];
  let at = null;
  for (const record of recordedTape.frames ?? []) {
    if (typeof record === 'number') continue;
    at = at && at.length === record.length ? at.map((v, i) => v + record[i]) : [...record];
    recordedRows.push(at);
  }
  const wantedRow = recordedRows.at(-1);
  if (!wantedRow || recordedRows.length === 0) {
    problems.push('the recorded tape holds no row to end a playback on');
  } else if (JSON.stringify(lastRow) !== JSON.stringify(wantedRow)) {
    problems.push(
      'the playback did not end standing in the last row the recording wrote ' +
        `(first joints ${lastRow.slice(0, 4).join(',')} against the recording's ${wantedRow.slice(0, 4).join(',')})`,
    );
  }
  summary.tape.lastRow = { played: lastRow.slice(0, 8), recorded: wantedRow?.slice(0, 8) };
}

// A seek is a wind rather than a jump: the stage goes back to the tape's own beginning and the run is walked to
// the step that was asked for — a walk of arithmetic now rather than a simulation, but the same one way to
// reach a step of a run there ever was.
//
// The clock below is the one the slider is told to read out (`TapeTimeline.vue`), written out here as the same
// three lines of arithmetic: the bar draws no clock of its own to read, so the only way to check that a run is
// still *said* rather than shown is to work out what it should say and compare.
const stepClock = (steps) => {
  const seconds = (steps * 20) / 1000;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds - minutes * 60).toFixed(1).padStart(4, '0')}`;
};
const wanted = await page.evaluate(() => {
  const step = Math.round(window.__garden.tapeState.steps / 3);
  window.__garden.seek(step);
  return step;
});
await wait(1200);
const afterSeek = await page.evaluate(() => {
  const slider = document.querySelector('.tape__slider');
  return {
    report: window.__garden.tapeState,
    slider: Number(slider?.value ?? -1),
    // ...and the reading the slider gives out went with it: the same clock that is not drawn anywhere follows the
    // playhead, so what a player who cannot see the slider move is told is where the run now stands.
    readout: slider?.getAttribute('aria-valuetext') ?? '',
  };
});
summary.tape.seek = { wanted, afterSeek };
if (afterSeek.report.step !== wanted || afterSeek.report.seeking) {
  problems.push(
    `a seek to ${wanted} left the playhead at ${afterSeek.report.step} (seeking: ${afterSeek.report.seeking})`,
  );
}
if (afterSeek.slider !== wanted) {
  problems.push(`a seek to ${wanted} left the slider at ${afterSeek.slider}`);
}
if (afterSeek.readout !== `${stepClock(wanted)} / ${stepClock(afterSeek.report.steps)}`) {
  problems.push(`a seek to ${wanted} read out "${afterSeek.readout}"`);
}

// The tape as a file, out and back in: what a recording is for is being handed to somebody else, and a file that
// could not be read back would be a recording of nothing.
await page.evaluate((json) => window.__garden.loadTape(json), tapeFile);
await wait(250);
const reloaded = await page.evaluate(() => window.__garden.tapeState);
summary.tape.reloaded = reloaded;
if (!reloaded.loaded || reloaded.steps !== played.report.steps || reloaded.bytes !== tapeBytes) {
  problems.push(`a tape off its own file came back as ${JSON.stringify(reloaded)}`);
}

// And off the timeline again: the world is the player's own once more — the one room stands as it always
// did — and the game's own row of tools and chat comes back with it.
await page.click('.tape__close');
await wait(400);
const unloaded = await page.evaluate(() => ({
  report: window.__garden.tapeState,
  timeline: document.querySelector('.tape') !== null,
  walls: window.__garden.engine.maxx,
  tools: document.querySelector('.toolbar') !== null,
  chat: document.querySelector('.chat-strip') !== null,
}));
summary.tape.unloaded = unloaded;
if (unloaded.report.loaded || unloaded.timeline) {
  problems.push('the timeline stayed up after it was closed');
}
if (!unloaded.tools || !unloaded.chat) {
  problems.push('the bar of tools and the chat did not come back after the tape was put away');
}
if (Math.abs(unloaded.walls - wallsWhileRecording.maxx) > 0.001) {
  problems.push(`the walls moved to ${unloaded.walls} when the tape was put away`);
}

// The links the chat's lines carry, and what following one does.
//
// It comes at the foot of the tape's own section on purpose. The tape a link hands over is the file the
// section above has just recorded: `tapeFile`, the game's own JSON of a run this page walked — handed out
// as somebody else's, whose line in the log says «Начал игру» the way every run's own line does. Nothing is
// invented here, and nothing about the format is read twice: what is checked is that following a link plays
// *that* run — its steps, its walls — rather than that a line looks like a link.
//
// The page's own runs have been saying themselves all along: every run this page began put a line up in the
// chat and bound itself to it (`useLiveRun`), and the tally of those sayings is read here — the words the
// door was asked to carry («Начал игру»), the line they were said against, and the run they were said for.
const smokedRun = {
  id: 'smoke-run',
  name: 'прогон смоука',
  author: 'Костя',
  steps: recordedTape.steps,
  step_ms: recordedTape.step,
};
chatTapes.set(smokedRun.id, tapeFile);
// The run's own row and its own line in the log: what a link is drawn from. The row says the words, the
// line carries the link, and — for a run that arrived whole rather than being played — both are written by
// the server the way the page that played one writes them for itself.
chatRows.set(smokedRun.id, {
  id: smokedRun.id,
  name: smokedRun.name,
  author: smokedRun.author,
  steps: smokedRun.steps,
  step_ms: smokedRun.step_ms,
  live: false,
  label: 'Начал игру',
});
chatLog.push({
  id: chatNext++,
  user_id: 5,
  nick: smokedRun.author,
  icon: '-',
  ghost: false,
  parts: [{ kind: 'run', run: smokedRun.id }],
  sent_ms: Date.now(),
});

// The sayings of the page's own runs: every run this page has played (the recording the tape section walked,
// and the runs of the sections before it) opened itself on the server, wrote a line linking itself, and
// bound itself to that line with its first words. One saying per run, message id and all — the id of a line
// that is in the log above, linking the run that was saying it.
summary.runs = { said: chatSaid.map((one) => ({ ...one })) };
if (!chatSaid.some((one) => one.label === 'Начал игру' && typeof one.message === 'number')) {
  problems.push(
    `the page's own runs were said as ${JSON.stringify(chatSaid)} rather than bound to lines with their first words`,
  );
}
for (const one of chatSaid) {
  const line = chatLog.find((candidate) => candidate.id === one.message);
  if (!line || !line.parts.some((part) => part.kind === 'run' && part.run === one.id)) {
    problems.push(`the run ${one.id} was bound to message ${one.message}, which is not its line in the log`);
  }
}

await page.click('.chat-strip');
await linkArrived(smokedRun.id);
const runLink = await page.evaluate((id) => {
  const link = document.querySelector(`.chat-card .chat-line__run[data-run="${id}"]`);
  if (!link) return { said: null };
  const line = link.closest('.chat-line');
  return {
    said: line.textContent.trim(),
    isAnchor: link.tagName === 'A',
    cursor: getComputedStyle(link).cursor,
    underlined: getComputedStyle(link).textDecorationLine.includes('underline'),
    at: (() => {
      const rect = link.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })(),
  };
}, smokedRun.id);
summary.runs.link = runLink;
await page.screenshot({ path: join(outDir, '27-chat-runs.png') });
if (runLink.said === null) {
  problems.push(`the log has no line linking ${smokedRun.id}`);
} else {
  if (!runLink.said.startsWith(`${smokedRun.author}: Начал `) || !runLink.said.endsWith('игру')) {
    problems.push(`the line of a run that has just begun reads "${runLink.said}"`);
  }
  if (!runLink.isAnchor) problems.push('a run\'s link in the window is not a link to follow');
  if (runLink.cursor !== 'pointer') problems.push(`a run's link answers the pointer with ${runLink.cursor}`);
  if (!runLink.underlined) problems.push('a run\'s link is not underlined');
}

// A link followed: that run's tape is asked for, the window shuts, and what the world walks is the run the
// link named — asked for by the link's own id, and played from its own beginning rather than from wherever
// this page had been left. The address is told the run as well, which is what makes a page that is watching
// a run a page holding the address that opens it.
const askedFor = () => chatAsked.tapes.at(-1) ?? null;
if (runLink.at) await page.mouse.click(runLink.at.x, runLink.at.y);
// The screen is left by the garden panning back to the stage — waited out like every pan, and the
// chat's own screen waited out with it: its emptying is a latch that follows the settle by a breath.
await panSettled(2);
await page
  .waitForFunction(() => getComputedStyle(document.querySelector('.chat-card')).display === 'none', {
    timeout: 10000,
    polling: 250,
  })
  .catch(() => undefined);
const picked = await page.evaluate(() => ({
  report: window.__garden.tapeState,
  // The chat's screen, off in its own place in the garden rather than gone: what says it is "shut"
  // is that it is no longer on the window.
  window: (() => {
    const card = document.querySelector('.chat-card');
    return card ? getComputedStyle(card).display !== 'none' : false;
  })(),
  timeline: document.querySelector('.tape') !== null,
  walls: window.__garden.engine.maxx,
  // What the address says: a run opened from the chat is a run the player can hand to somebody else.
  addressRun: new URLSearchParams(location.search).get('run'),
}));
summary.runs.picked = { ...picked, asked: askedFor() };
await page.screenshot({ path: join(outDir, '28-run-picked.png') });
if (picked.window) problems.push('the chat window stayed up over the run its link was followed to');
if (!picked.timeline) problems.push('following a link put no tape on the timeline');
if (askedFor() !== smokedRun.id) {
  problems.push(`the tape of a link followed came off the server as ${askedFor()} rather than as ${smokedRun.id}`);
}
if (picked.addressRun !== smokedRun.id) {
  problems.push(`the address says run=${picked.addressRun} rather than the run that was opened`);
}
if (!picked.report.loaded || picked.report.steps !== smokedRun.steps) {
  problems.push(
    `the run off the link is ${JSON.stringify(picked.report)} rather than the link's own run of ${smokedRun.steps} steps`,
  );
}
// Half a second in, the run above is walking and its playhead is well inside it. What is *not* read here is
// the room it walks in: a run carries the window it was made in and puts it back as it goes (the `v` events
// of the file), so at its own beginning it walks in the room of the recording's beginning — which is this
// window's own, this run having been made in a window of this size. The room is read below, where a run has
// one of its own: out at the other end, past the resize in the middle of the recording.
if (!picked.report.playing) {
  problems.push(`the run off the link is not walking: ${JSON.stringify(picked.report)}`);
}
if (!(picked.report.step > 0) || picked.report.step >= picked.report.steps) {
  problems.push(
    `the run off the link was at step ${picked.report.step} of ${picked.report.steps} a moment after it started`,
  );
}
// Six seconds is longer than any run this section records, so the picked run is over by the time it is up —
// and where it walked is then the room of the *end* of the recording rather than this window's own.
await wait(6000);
const pickedRoom = await page.evaluate(() => ({
  report: window.__garden.tapeState,
  walls: window.__garden.engine.maxx,
}));
summary.runs.picked.room = pickedRoom;
if (pickedRoom.report.playing || pickedRoom.report.step !== pickedRoom.report.steps) {
  problems.push(
    `the run off the link ended at step ${pickedRoom.report.step} of ${pickedRoom.report.steps} ` +
      `(playing: ${pickedRoom.report.playing})`,
  );
}
if (Math.abs(pickedRoom.walls - wallsWhileRecording.maxx) > 0.001) {
  problems.push(
    `the run off the link kept her inside walls at ${pickedRoom.walls} rather than the one room's ` +
      `${wallsWhileRecording.maxx}`,
  );
}

// And off the timeline again: what following a link leaves behind is the world as it was — the tape's own
// bar gone, the bar of tools and the strip back in their corner, the room this window's own, and the
// address back to what it was — a page no longer watching a run is a page whose address should not say it
// is.
if (picked.timeline) await page.click('.tape__close');
await wait(400);
const pickedAway = await page.evaluate(() => ({
  report: window.__garden.tapeState,
  timeline: document.querySelector('.tape') !== null,
  tools: document.querySelector('.toolbar') !== null,
  chat: document.querySelector('.chat-strip') !== null,
  walls: window.__garden.engine.maxx,
  addressRun: new URLSearchParams(location.search).get('run'),
}));
summary.runs.pickedAway = pickedAway;
if (pickedAway.report.loaded || pickedAway.timeline) {
  problems.push('the timeline stayed up after the run off the link was put away');
}
if (!pickedAway.tools || !pickedAway.chat) {
  problems.push('the bar of tools and the chat did not come back after the run off the link was put away');
}
if (Math.abs(pickedAway.walls - wallsWhileRecording.maxx) > 0.001) {
  problems.push(`the walls moved to ${pickedAway.walls} after the run off the link was put away`);
}
if (pickedAway.addressRun !== null) {
  problems.push(`the address still says run=${pickedAway.addressRun} after the tape was put away`);
}

// A run that is still being played, watched from this page.
//
// This is the other half of the live run above: that section checked what this page *sends* as it plays, and
// this one checks what a page *reads* while somebody else is still playing — the line in the chat that says
// «(Идёт стрим)» beside its link, the following of the link, and the tape that goes on arriving afterwards
// (`useRuns`, and the walk that carries on into it, `Game.growTape`).
//
// What the server outside serves is the run this page has just recorded, handed out as somebody else's: its
// own head and its own records, cut into slices of a second the way the page that played them handed them
// over, and released a second at a time (`foreignRun.arrived`). Nothing is canned and nothing about the
// format is invented: a slice that arrived twice would put a second of the run on the tape twice.
/**
 * A recorded tape cut into slices of a second — fifty steps of it, which is what one slice is worth
 * (`TAPE_SLICE_STEPS`), and what the page that played the run handed over.
 *
 * The tape is the *file* of the run and its records are one list, so the only thing to cut by is the
 * steps each record covers — a row a step and a pause its own length — and the slices' records put end
 * to end are the file's own records again. That is what makes a run which arrives in pieces the run
 * itself, and it is what the watcher's own paste is measured against here.
 */
function sliced(tape, every) {
  const slices = [];
  let cut = [];
  let covered = 0;
  for (const record of tape.frames) {
    const steps = typeof record === 'number' ? record : 1;
    cut.push(record);
    covered += steps;
    if (covered >= every) {
      slices.push({ steps: covered, frames: cut, edits: [] });
      cut = [];
      covered = 0;
    }
  }
  if (cut.length > 0 || slices.length === 0) slices.push({ steps: covered, frames: cut, edits: [] });
  return slices;
}

foreignRun = {
  id: 'smoke-live',
  row: { id: 'smoke-live', name: 'чужой прогон', author: 'Костя', step_ms: recordedTape.step, live: true },
  label: 'Начал игру',
  head: { format: recordedTape.format, step: recordedTape.step, seed: recordedTape.seed, stage: recordedTape.stage },
  slices: sliced(recordedTape, 50).map((slice, seq) => ({ ...slice, seq })),
  asked: [],
  // How much of the run has happened: the first slice of it at once — a window that arrives watches the
  // run from its own beginning — and one more slice for every couple of the viewer's own asks after
  // that, up to the whole of it. The asking is the viewer's clock here rather than the wall's: a page
  // rendering the world in software asks slower than the wall runs, and a run that spent all its
  // seconds while its viewer was still building the tape is nobody's test of one that is still going.
  // The asking is cleared when the viewer sits down, which is the run's own beginning as far as this
  // test is concerned.
  arrived() {
    return Math.min(this.slices.length, Math.floor(this.asked.length / 2) + 1);
  },
};
// Its own line in the log, as the player still playing it would have written: a link, with the row saying
// the words — and while the run is still going, the line wears «(Идёт стрим)» beside them.
chatLog.push({
  id: chatNext++,
  user_id: 5,
  nick: foreignRun.row.author,
  icon: '-',
  ghost: false,
  parts: [{ kind: 'run', run: foreignRun.id }],
  sent_ms: Date.now(),
});

await page.click('.chat-strip');
await linkArrived(foreignRun.id);
const liveRow = await page.evaluate((id) => {
  const link = document.querySelector(`.chat-card .chat-line__run[data-run="${id}"]`);
  if (!link) return { said: null };
  const line = link.closest('.chat-line');
  const rect = link.getBoundingClientRect();
  return {
    said: line.textContent.trim(),
    isAnchor: link.tagName === 'A',
    at: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
  };
}, foreignRun.id);
/** The tape as the page has it, and where the interface is: read again and again below, which is the point. */
const onTimeline = () =>
  page.evaluate(() => ({
    ...window.__garden.tapeState,
    timeline: document.querySelector('.tape') !== null,
    window: (() => {
      const card = document.querySelector('.chat-card');
      return card ? card.getBoundingClientRect().left < innerWidth - 2 : false;
    })(),
    tools: document.querySelector('.toolbar') !== null,
  }));
summary.watching = { row: liveRow, asked: foreignRun.asked };
if (!liveRow.at) {
  problems.push(`the log has no line linking the run that is still being played (${JSON.stringify(liveRow)})`);
} else {
  // A link to a run that is still going says so beside its words — «(Идёт стрим)» — which is the one thing
  // on a line that is not a number worked out of anything: the reader is being told to come back, because
  // the end of the run is not in the link yet.
  if (!liveRow.said.includes('(Идёт стрим)')) {
    problems.push(`the line of a run that is still being played reads "${liveRow.said}"`);
  }
  if (!liveRow.isAnchor) problems.push('the line of a live run is not a link to follow');

  // The run's own beginning is the viewer sitting down: the asking is cleared here, and everything
  // before was the chat finding the line to sit down by.
  foreignRun.asked.length = 0;
  await page.mouse.click(liveRow.at.x, liveRow.at.y);
  // The garden pans back to the stage on the way in — waited out like every pan, and the chat's own
  // screen waited out with it: its emptying is a latch that follows the settle by a breath
  // (`chatShown` in `App.vue`), and a reading taken against that breath is a race, not a check.
  await panSettled(2);
  const chatHiddenAt = Date.now();
  await page
    .waitForFunction(() => getComputedStyle(document.querySelector('.chat-card')).display === 'none', {
      timeout: 20000,
      polling: 250,
    })
    .catch(() => undefined);
  summary.watching.hidingTookMs = Date.now() - chatHiddenAt;
  const first = await onTimeline();
  const grownPast = async (from) => {
    const began = Date.now();
    for (;;) {
      await wait(200);
      const now = await onTimeline();
      if (now.steps > from || Date.now() - began > 5000) return now;
    }
  };
  const second = await grownPast(first.steps);
  const third = await grownPast(second.steps);

  // The press put the run so far on the timeline: the window shut (a playback is not something to read a chat
  // over), the tape's own bar up where the tools and the strip were, and the run a second or more long rather
  // than empty — its first second had already happened by the time this page arrived.

  if (first.tools) problems.push('the bar of tools stayed up over a run that is being watched');
  if (!first.timeline || !first.loaded) {
    problems.push('a run that is still being played did not reach the timeline');
  }
  if (!(first.steps > 0)) problems.push('a run that is still being played arrived with no steps in it');
  // And it *grows*: the tape under the walk is the run as it stands, so its length is read again a second later
  // and again — which is the whole of what watching a run somebody else is playing is.
  if (!(second.steps > first.steps)) {
    problems.push(`the tape did not grow: ${first.steps} steps, then ${second.steps}`);
  }
  if (!(third.steps > second.steps)) {
    problems.push(`the tape grew once and stopped: ${second.steps} steps, then ${third.steps}`);
  }
  // The walk is neither restarted by the growth nor left standing: the playhead moves on, and it never runs
  // past the end of the tape it is walking (`playFrame`, `Game.growTape`).
  if (!(third.step > first.step)) problems.push(`the playback stood still: ${first.step} steps, then ${third.step}`);
  if (third.step > third.steps) {
    problems.push(`the playhead ran past the end of the tape: ${third.step} of ${third.steps}`);
  }
  summary.watching.tape = { first, second, third };

  // What the page asked the run for: what it has, and never a slice it has already pasted on. Every ask is
  // here in order, so the first of them has to be the one with nothing behind it, and no later one may go
  // backwards — a viewer that asked for a second of the run it already had would paste it on twice.
  const pasts = foreignRun.asked.map((one) => one.after);
  summary.watching.pasts = pasts;
  if (!pasts.length) problems.push('the page never asked the run what it had');
  if (pasts[0] !== -1) problems.push(`the first ask past was ${pasts[0]} rather than nothing at all`);
  for (let i = 1; i < pasts.length; i++) {
    if (pasts[i] < pasts[i - 1]) problems.push(`the page asked past ${pasts[i]} after having ${pasts[i - 1]}`);
  }

  // The watcher's own tab goes away — switched off, another window over it — and comes back, and the
  // watched run must not notice: what the tape holds is the tape's, and nothing about *this* page's
  // visibility may reach into the world the tape is walking (`Game.onVisibility`). The reading after
  // coming back is the same one as before: the run has grown and the playhead has gone on with it.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(600);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(1500);
  // The growth itself is what is waited for, the same as above: slices land on their own clock, and a
  // reading timed against one can land either side of it. A run that has already arrived whole has
  // nothing left to grow by — the run this watches is this run's own recording, and its length is
  // known on this side of the wire.
  const awayAndBack = await grownPast(third.steps);
  summary.watching.awayAndBack = awayAndBack;
  if (!(awayAndBack.steps > third.steps) && third.steps < recordedTape.steps) {
    problems.push(`the watched run stopped growing while the watcher was away (${third.steps} steps)`);
  }
  if (!(awayAndBack.step > third.step)) {
    problems.push(`the playback stood still through the watcher going away (${third.step} steps)`);
  }
  await page.screenshot({ path: join(outDir, '30-run-watched.png') });

  // And off the timeline again, which is where the watching stops: a run that is not on the timeline any more is
  // a run nobody is watching, so the asking is over with it (`useRuns.stop`, reached through the tape's own
  // report in `App.vue`).
  await page.click('.tape__close');
  await wait(400);
  const watchedOff = await onTimeline();
  const askedAtClose = foreignRun.asked.length;
  await wait(1800);
  summary.watching.off = { ...watchedOff, askedAtClose, askedLater: foreignRun.asked.length };
  if (watchedOff.timeline || watchedOff.loaded) {
    problems.push('the timeline stayed up after a run that was being watched was put away');
  }
  if (!watchedOff.tools) problems.push('the bar of tools did not come back after a watched run was put away');
  if (foreignRun.asked.length !== askedAtClose) {
    problems.push(
      `the page asked about a run that is not on the timeline any more: ${askedAtClose} asks, ` +
        `${foreignRun.asked.length} after it was put away`,
    );
  }
}

// The player's own game, across a watch. Everything above watched runs from a page whose own run was already
// over — ended on purpose, to have it on the timeline. What is checked here is the other way round, and it is
// the promise a page keeps to its player: a run *in progress*, interrupted by a watch of somebody else's run,
// and what comes back when that tape is put away — the scene the player left (their dolls and ropes, and the
// pose they had made of them) and *their own run*, going on under the same id the server was handed when it
// began, rather than a new one opened for every return to the game.

/**
 * Reads a number of the world until it stops moving between readings.
 *
 * The scene this section works from has been falling since the watched run was put away — the pause it was
 * left in is a pose mid-run, not a resting one — and a press aimed at a doll of a falling world is a press
 * that misses her. A world with no run being written creeps ever smaller fractions and is read as its own
 * mass; a world with one stops stepping *exactly* through the run's own pause (`Game.runIsIdle`), and is
 * read as the run's own count of its steps — which stops growing the moment the pause holds the world
 * (`TapeReport.step` while a run is being written).
 */
async function settledRead(read, maxMs = 20000) {
  let was = await read();
  // Two calm readings rather than one: a world settling slowly through software rendering can pass a
  // single half-second of near-stillness while it still has most of a settling to do, and the
  // sections that compare one settled reading against another are about exactly that.
  let calm = 0;
  const began = Date.now();
  for (;;) {
    await wait(500);
    const now = await read();
    calm = Math.abs(now - was) < 0.01 ? calm + 1 : 0;
    if (calm >= 2 || Date.now() - began > maxMs) return now;
    was = now;
  }
}

/** The world's own mass, read through the engine. */
const massOfTheWorld = () => page.evaluate(() => window.__garden.centreOfMassY());

/** How many steps the run being written has taken: the playhead is the run's own length while it is written. */
const stepsOfTheRun = () => page.evaluate(() => window.__garden.tapeState.step);

/** The lowest doll on the screen. */
function lowestDoll() {
  return page.evaluate(() => {
    const handles = window.__garden.overview().dollHandles;
    return handles.length > 0 ? handles.reduce((low, one) => (one.y > low.y ? one : low)) : null;
  });
}

// A doll of the player's own scene, taken hold of: the touch is what starts a run (`Game.pressAt`), which the
// server is handed at once (`useLiveRun`). The world is waited for first — a scene mid-fall is no scene to
// put aside — and the doll taken is the lowest of them, clear of everything the page hangs over the world.
await settledRead(massOfTheWorld);
const openedAtTouch = chatLive.opened.length;
let ownHandle = await lowestDoll();
if (!ownHandle) {
  problems.push('the own-game section found no doll to hold');
} else {
  await page.mouse.move(ownHandle.x, ownHandle.y);
  await page.mouse.down();
  await wait(150);
  const begun = await page.evaluate(() => ({
    recording: window.__garden.tapeState.recording,
    seed: window.__garden.liveHead()?.seed ?? null,
  }));
  if (!begun.recording || begun.seed === null) {
    // What stands over the point is named rather than guessed at: a press that began no run was either spent
    // on something else or never reached the stage, and the element under the pointer says which.
    const over = await page.evaluate((at) => {
      const hit = document.elementFromPoint(at.x, at.y);
      return { tag: hit?.tagName ?? null, cls: hit?.className ?? null };
    }, ownHandle);
    problems.push(`holding a doll did not begin a run (${JSON.stringify({ ...begun, over })})`);
  }
  for (let i = 1; i <= 22; i++) {
    await page.mouse.move(ownHandle.x + i * 7, ownHandle.y - i * 5);
    await wait(40);
  }
  await page.mouse.up();
  // ...and let her land: a run takes its own pause through a stillness rather than the minutes of it
  // (`Game.runIsIdle`), so the waiting costs the run its two allowed seconds and leaves the player a world
  // frozen where it stands — a settled scene to be read from, and to be put aside whole by the watch below.
  await settledRead(stepsOfTheRun);
  const beforeWatch = await page.evaluate(() => ({
    recording: window.__garden.tapeState.recording,
    seed: window.__garden.liveHead()?.seed ?? null,
    dolls: window.__garden.world.dolls.length,
    ropes: window.__garden.world.ropes.length,
    still: window.__garden.centreOfMassY(),
  }));
  const slicesBefore = chatLive.opened.at(-1)?.slices.length ?? 0;
  if (chatLive.opened.length !== openedAtTouch + 1) {
    problems.push(
      `the run the touch began was opened ${chatLive.opened.length - openedAtTouch} times on the server`,
    );
  }
  if (beforeWatch.seed !== begun.seed) {
    problems.push('the run being written changed its seed under the player');
  }

  // The watch: the smoked run again, off the same list — the player's own run is *not* over, and must not be
  // ended by the watching of another one (`Game.loadTape` puts the player's game aside rather than away).
  // The row is pressed where it stands once the pan has arrived, the way the live one below is.
  await page.click('.chat-strip');
  await chatArrived();
  // The stage's own clock, stood still by the leaving of it: the run being written waits at the step
  // it had got to, and nothing of the away time is recorded (`Game.suspend`) — read twice, a second
  // and a half apart, and the two readings have to be the same step.
  const awayFirst = await stepsOfTheRun();
  await wait(1500);
  const awaySecond = await stepsOfTheRun();
  summary.ownRunAway = { awayFirst, awaySecond };
  if (awayFirst !== awaySecond) {
    problems.push(
      `the run being written took ${awaySecond - awayFirst} steps while the player was away at the chat`,
    );
  }
  const ownRow = await page.evaluate((id) => {
    const link = document.querySelector(`.chat-card .chat-line__run[data-run="${id}"]`);
    if (!link) return null;
    const rect = link.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, smokedRun.id);
  if (!ownRow) {
    problems.push('the own-game section found no finished run to watch off the chat');
  } else {
    await page.mouse.click(ownRow.x, ownRow.y);
  }
  await panSettled(2);
  await wait(900);
  const underWatch = await page.evaluate(() => ({
    loaded: window.__garden.tapeState.loaded,
    recording: window.__garden.tapeState.recording,
  }));
  if (!underWatch.loaded) problems.push('the own-game section put no tape on the timeline to watch');
  if (!underWatch.recording) problems.push('a watch ended the run being written under it');
  await page.click('.tape__close');
  await wait(400);
  // The scene the watch put aside comes back exactly as it was put aside — and settles on from there, which
  // is the run's own doing again, so the reading below waits for its pause like the one above did: both
  // readings are of a world the run has frozen, and what stands between them is the watch and nothing else.
  await settledRead(stepsOfTheRun);

  // And back: the scene as it was left — the same dolls, stones, balls and ropes, standing where they stood —
  // and the same run, still being written, not a new one for the return.
  const backHome = await page.evaluate(() => ({
    loaded: window.__garden.tapeState.loaded,
    recording: window.__garden.tapeState.recording,
    seed: window.__garden.liveHead()?.seed ?? null,
    dolls: window.__garden.world.dolls.length,
    ropes: window.__garden.world.ropes.length,
    still: window.__garden.centreOfMassY(),
  }));
  summary.ownRun = { begun, beforeWatch, underWatch, backHome };
  if (backHome.loaded) problems.push('the timeline stayed up over the player\'s own game');
  if (!backHome.recording || backHome.seed !== beforeWatch.seed) {
    problems.push(
      `coming back from a watch did not go on with the same run ` +
        `(${beforeWatch.seed} before it, ${backHome.seed} after)`,
    );
  }
  if (chatLive.opened.length !== openedAtTouch + 1) {
    problems.push(
      `coming back from a watch opened ${chatLive.opened.length - openedAtTouch - 1} more run(s) than the one begun`,
    );
  }
  for (const counted of ['dolls', 'ropes']) {
    if (backHome[counted] !== beforeWatch[counted]) {
      problems.push(
        `the scene came back with ${backHome[counted]} ${counted} where it had left ${beforeWatch[counted]}`,
      );
    }
  }
  if (Math.abs(backHome.still - beforeWatch.still) > 0.5) {
    problems.push(
      `the scene came back standing ${(backHome.still - beforeWatch.still).toFixed(3)} from where it was left`,
    );
  }

  // ...and the run goes on: another second of the player's play is the *next* second of the same run — the
  // same id, the numbers counted on from where they were, and no ending anywhere in it.
  ownHandle = await lowestDoll();
  if (ownHandle) {
    await page.mouse.move(ownHandle.x, ownHandle.y);
    await page.mouse.down();
    for (let i = 1; i <= 22; i++) {
      await page.mouse.move(ownHandle.x - i * 6, ownHandle.y + i * 4);
      await wait(40);
    }
    await page.mouse.up();
    await wait(1600);
  }
  const ownLive = chatLive.opened.at(-1);
  const numbered = (ownLive?.slices ?? []).map((one) => one.seq);
  summary.ownRun.continued = {
    id: ownLive?.id,
    slices: ownLive?.slices.length ?? 0,
    numbered: numbered.join(','),
    ended: ownLive?.ended ?? null,
  };
  if (ownLive && ownLive.slices.length <= slicesBefore) {
    problems.push(
      `the run that went on across a watch sent no more of itself (${slicesBefore} slices before the watch)`,
    );
  }
  if (numbered.join(',') !== numbered.map((one, at) => at).join(',')) {
    problems.push(`the slices of a run that crossed a watch are numbered ${numbered.join(',')}`);
  }
  await page.screenshot({ path: join(outDir, '31-own-run-resumed.png') });
}

const errors = logs.filter(
  (line) =>
    !line.startsWith('[warn]') &&
    // The favicon is the only thing this page ever fails to fetch.
    !line.includes('Failed to load resource') &&
    !line.includes('GPU stall'),
);
console.log(
  'signed in:',
  `waited on «${summary.handshake.text}» at ${summary.handshake.centre.join(',')} ` +
    `(${summary.handshake.size}, ${summary.handshake.middle.tag}.${summary.handshake.middle.className})`,
  '->',
  `${summary.handshake.after.middle.tag}.${summary.handshake.after.middle.className}`,
  summary.handshake.after.gone ? 'with the waiting word gone' : 'with the waiting word still up',
);

console.log('steps:', summary.steps.map((s) => `${s.step}:comY=${s.state.centreOfMassY}`).join(' '));
console.log(
  'laid out at y =',
  summary.settledY,
  '| her joints cover',
  `${summary.lyingJoints.width}x${summary.lyingJoints.height}`,
  'world pixels | moved at most',
  summary.lyingMove.toFixed(3),
  'px between readings in three seconds, drifting',
  summary.lyingDrift.toFixed(3),
);
console.log('pause held her still:', summary.pauseHeldStill);
console.log(
  'portraits:',
  summary.portraits.added.cards.map((card) => `${card.name}:${card.portrait}`).join(' '),
  '| landed',
  calm.portrait,
  '| head along her front',
  pulledFront.portrait,
  '| along her back',
  pulledBack.portrait,
  '| knees apart',
  (summary.pain.knee2.dragged.cards[0] ?? {}).portrait,
  '(thighs',
  summary.pain.thighs,
  '->',
  summary.pain.knee2.thighs,
  'degrees)',
);
console.log(
  'machine (worst step / face, doll by doll):',
  'start', summary.machines.first.map((m) => `${m.worst}/${m.portrait}`).join(' '),
  '| paused', summary.pausedPose.machines.map((m) => `${m.worst}/${m.portrait}`).join(' '),
  '| knee 1', summary.pain.knee1.machines.map((m) => `${m.worst}/${m.portrait}`).join(' '),
  '| knee 2', summary.pain.knee2.machines.map((m) => `${m.worst}/${m.portrait}`).join(' '),
);
console.log('drag:', JSON.stringify(summary.drag));
console.log('after release, moved by:', summary.afterRelease.fell.toFixed(1));
console.log('respawned neck:', JSON.stringify(summary.respawn.particles.neck), 'speed:', summary.respawn.speed);
const burned = summary.toolbar.burn?.bursts[0] ?? { x: 0, y: 0, nodes: 0, age: 0, ring: 0 };
const burnedLater = summary.toolbar.burnLater?.[0] ?? { age: 0, ring: 0 };
console.log(
  'toolbar: rope drawn?',
  summary.toolbar.drawn.ropes === 1,
  '| tied to her?',
  Boolean(summary.toolbar.drawn.ropeHandles[0]?.tied),
  '| worst rope stretch',
  summary.toolbar.drawn.longestStretch.toFixed(4),
  '| knot carried',
  (summary.toolbar.knotCarriedOff ?? -1).toFixed(1) + 'px off the hand',
  '| edge assist carried',
  (dropWorld && grabWorld ? dropWorld.carried - grabWorld.carried : 0).toFixed(1) + 'px',
  '| hall',
  hall ? `${hall.width}x${hall.height}` : 'none',
  '| dolls',
  summary.toolbar.drawn.dolls,
  '->',
  summary.toolbar.afterAdd.dolls,
  '->',
  summary.toolbar.afterDollClick.dolls,
  '(a press on one takes hold of her)',
  '| pointer over rope/knot',
  `${summary.toolbar.cursorOverRope}/${summary.toolbar.cursorOverKnot}`,
  '->',
  summary.toolbar.cursorAfterBurn,
  '| burst at',
  `${burned.x.toFixed(0)},${burned.y.toFixed(0)}`,
  'of',
  burned.nodes,
  'joints, ring',
  `${burned.ring.toFixed(0)}->${burnedLater.ring.toFixed(0)}px of ${7 + 96} by`,
  `${burnedLater.age.toFixed(2)}s, read`,
  burned.age.toFixed(2),
  's in, gone a second later:',
  summary.toolbar.afterBurst === 0,
  '| ropes left',
  summary.toolbar.afterBurn?.ropes,
  '| tool back to',
  summary.toolbar.toolAfterBurn,
);
console.log(
  'bar words:',
  (summary.toolbar.hints?.rest ?? []).map((hint) => hint.word).join(' / '),
  '| worn for the pointer on',
  ['drag', 'rope', 'chat']
    .map((tool) => {
      const hint = (summary.toolbar.hints?.[tool] ?? []).find((entry) => entry.shown);
      return hint ? `${tool}: ${hint.word} over ${hint.landed}` : `${tool}: nothing`;
    })
    .join(', '),
);
console.log(
  'page:',
  favicon ? `icon ${favicon.sizes.join(', ')}` : 'no icon',
  favicon ? `${(favicon.bytes / 1024).toFixed(1)} KB at ${favicon.href.split('/').pop()}` : '',
);
console.log(
  'interface: bar at',
  `${(started.bar?.x ?? -1).toFixed(0)}, ${(started.bar?.y ?? -1).toFixed(0)}`,
  'down to',
  `${((started.bar?.y ?? 0) + (started.bar?.height ?? 0)).toFixed(0)}`,
  '(three buttons',
  `${(started.bar?.height ?? 0).toFixed(0)} tall)`,
  '| world at',
  `${started.world.x.toFixed(0)}, ${started.world.y.toFixed(0)} ${started.world.width.toFixed(0)}x${started.world.height.toFixed(0)}`,
  '| showing',
  `${(firstView?.width ?? 0).toFixed(0)}x${(firstView?.height ?? 0).toFixed(0)}`,
  'of the',
  `${summary.inspect.stage.width}x${summary.inspect.stage.height}`,
  '| walls',
  `${(summary.walls?.width ?? 0).toFixed(0)} wide to ${(summary.walls?.left ?? 0).toFixed(0)}..${(summary.walls?.right ?? 0).toFixed(0)}`,
  '| floor at',
  `${(summary.walls?.floor ?? 0).toFixed(0)}`,
  '| scale',
  hud.scale,
  '| the picture reaches the canvas edges:',
  `${(started.pixels?.edges ?? []).every((pixel) => pixel.join() !== '0,0,0')}`,
  '| layers',
  started.layers.join(' < '),
);
console.log(
  'small window:',
  `${small.canvas.cssWidth}x${small.canvas.cssHeight}`,
  '| world',
  `${small.world.width.toFixed(0)}x${small.world.height.toFixed(0)}`,
  '| shows',
  `${small.view.width.toFixed(0)}x${small.view.height.toFixed(0)}`,
  'at scale',
  small.view.scale.toFixed(2),
  '| interface shrunk to',
  small.hud.scale,
  '| bar at',
  `${(small.bar?.x ?? -1).toFixed(0)}, ${(small.bar?.y ?? -1).toFixed(0)}`,
);
console.log(
  'narrow window:',
  `${narrow.canvas.cssWidth}x${narrow.canvas.cssHeight}`,
  '| shows',
  `${narrow.view.width.toFixed(0)}x${narrow.view.height.toFixed(0)}`,
  'at scale',
  narrow.view.scale.toFixed(2),
  '| walls',
  `${narrowWalls.width.toFixed(0)} wide`,
  '| cards on the world\'s top right, rounded',
  narrow.cards.map((card) => card.corner).join(',') || '—',
);
console.log(
  'short window:',
  `${short.canvas.cssWidth}x${short.canvas.cssHeight}`,
  '| shows',
  `${short.view.width.toFixed(0)}x${short.view.height.toFixed(0)}`,
  'from y =',
  short.view.top.toFixed(0),
  'at scale',
  short.view.scale.toFixed(2),
  '| foot of the picture at y =',
  (short.view.y + short.view.height * short.view.scale).toFixed(0),
);
console.log(
  'ceiling:',
  `${ceiling.ceiling.toFixed(0)} to a picture that starts at ${pictureTop.toFixed(0)}`,
  '| reached in',
  `${ceiling.steps} steps`,
  '| came back down to',
  `${fallen.herLowest.toFixed(0)} on a floor at ${fallen.floor.toFixed(0)}`,
);
console.log(
  'touch:',
  `held ${summary.touch.heldByFinger}`,
  `two fingers: ${summary.touch.heldByTwoFingers}`,
  `lifted: ${summary.touch.lifted}`,
  `| dragged up ${summary.touch.rise}`,
  `| left the finger by ${summary.touch.drift}`,
);
console.log(
  'big window:',
  `${big.canvas.cssWidth}x${big.canvas.cssHeight}`,
  '| world',
  `${big.world.width.toFixed(0)}x${big.world.height.toFixed(0)}`,
  '(one CSS pixel per world pixel)',
  '| black frame on all four sides:',
  `corner rgb(${(summary.layout.big.pixels?.corner ?? []).join(',')})`,
  `beside rgb(${(summary.layout.big.pixels?.besideWorld ?? []).join(',')})`,
);
console.log(
  'tape:',
  `${((summary.tape?.recorded?.report?.steps ?? 0) * 20) / 1000}s of a run in`,
  `${((summary.tape?.bytes ?? 0) / 1024).toFixed(1)} KB`,
  `(${summary.tape?.recordedTape?.records ?? 0} records, ${summary.tape?.recordedTape?.pauses ?? 0} of them pauses, ${summary.tape?.recordedTape?.edits ?? 0} edits)`,
  // The playback's own promise, read straight off the file: the world it ends standing in is the last row
  // the recording wrote, quarter-pixel for quarter-pixel.
  '| ended standing in the last recorded row:',
  `${JSON.stringify(summary.tape?.lastRow?.played ?? []) === JSON.stringify(summary.tape?.lastRow?.recorded ?? [])}`,
  '| walls of the one room',
  `${summary.tape?.wallsWhileRecording?.maxx ?? 0}`,
  'watched in',
  `${summary.tape?.watching?.walls ?? 0}`,
  // The world a playback walks holds no ropes at all: a tape is the dolls' picture.
  '| ropes on the playback\'s stage:',
  `${summary.tape?.playing?.ropes ?? 0}`,
  // The tape's own bar, as the page laid it out: how wide and tall it came out, where its foot is, and whether it
  // sits on the middle of the world the frame gave it — with what the row above it gives up, and what it is that
  // ends the mode it stands for.
  '| the tape\'s bar',
  `${(summary.tape?.recorded?.timeline?.width ?? 0).toFixed(0)}x${(summary.tape?.recorded?.timeline?.height ?? 0).toFixed(0)}`,
  'with its foot at',
  `${((summary.tape?.recorded?.timeline?.y ?? 0) + (summary.tape?.recorded?.timeline?.height ?? 0)).toFixed(0)}`,
  'of the world\'s',
  `${((summary.tape?.recorded?.world?.y ?? 0) + (summary.tape?.recorded?.world?.height ?? 0)).toFixed(0)}`,
  '| centred on the world:',
  `${Math.abs(
    (summary.tape?.recorded?.timeline?.x ?? 0) +
      (summary.tape?.recorded?.timeline?.width ?? 0) / 2 -
      ((summary.tape?.recorded?.hud?.x ?? 0) +
        ((summary.tape?.recorded?.hud?.width ?? 0) * (summary.tape?.recorded?.hud?.scale ?? 1)) / 2),
  ) < 1}`,
  '| the tools away while it is up:',
  `${!(summary.tape?.recorded?.tools ?? true)}`,
  'and back after it:',
  `${summary.tape?.unloaded?.tools ?? false}`,
  '| the way out reads',
  `${summary.tape?.recorded?.close ?? '—'}`,
  '| the clock not drawn:',
  `${!(summary.tape?.recorded?.clock ?? true)}`,
  'said instead:',
  `${summary.tape?.recorded?.readout ?? '—'}`,
);
console.log(
  'runs:',
  `the list holds ${summary.runs?.list?.rows ?? 0} row(s) signed`,
  `${summary.runs?.list?.nick ?? '—'}`,
  'reading',
  `${summary.runs?.list?.reading ?? '—'}`,
  '| it is',
  `${(summary.runs?.list?.list?.width ?? 0).toFixed(0)}x${(summary.runs?.list?.list?.height ?? 0).toFixed(0)}`,
  'beside a conversation',
  `${(summary.runs?.list?.chat?.width ?? 0).toFixed(0)} px wide, inside a window of`,
  `${(summary.runs?.list?.card?.width ?? 0).toFixed(0)}`,
  '| a row pressed asked the server for',
  `${summary.runs?.picked?.asked ?? '—'}`,
  'and is walking',
  `${summary.runs?.picked?.report?.step ?? -1} of ${summary.runs?.picked?.report?.steps ?? 0}`,
  'steps, then out at',
  `${summary.runs?.picked?.room?.report?.step ?? -1} of ${summary.runs?.picked?.room?.report?.steps ?? 0}`,
  'steps in walls at',
  `${summary.runs?.picked?.room?.walls ?? 0}`,
  '(the recorded room:',
  `${summary.tape?.wallsWhileRecording?.maxx ?? 0})`,
  '| put away:',
  `${!(summary.runs?.pickedAway?.report?.loaded ?? true)}`,
);
console.log(
  'watching: a run that is still being played read',
  `«${summary.watching?.row?.reading ?? '—'}» in the list, and its tape grew`,
  summary.watching?.tape
    ? `${summary.watching.tape.first.steps} -> ${summary.watching.tape.second.steps} -> ${summary.watching.tape.third.steps} steps`
    : '—',
  'with the playhead at',
  summary.watching?.tape
    ? `${summary.watching.tape.first.step} -> ${summary.watching.tape.third.step}`
    : '—',
  '| asked past:',
  `${(summary.watching?.pasts ?? []).join(',')}`,
  '| the asks when it was put away:',
  `${summary.watching?.off?.askedAtClose ?? -1} then ${summary.watching?.off?.askedLater ?? -1}`,
);
console.log(
  'own run across a watch:',
  summary.ownRun
    ? `began under seed ${summary.ownRun.begun.seed}, watched with the run still writing ` +
        `(${summary.ownRun.underWatch.recording}), came back to seed ${summary.ownRun.backHome.seed} ` +
        `with ${summary.ownRun.backHome.dolls} dolls of the ${summary.ownRun.beforeWatch.dolls} left, ` +
        `standing ${(summary.ownRun.backHome.still - summary.ownRun.beforeWatch.still).toFixed(3)} from where it was left,` +
        ` and grew to ${summary.ownRun.continued.slices} slices (${summary.ownRun.continued.numbered})` +
        ` under ${summary.ownRun.continued.id}${summary.ownRun.continued.ended ? ', ended' : ''}`
    : '—',
);
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('problems:', problems.length, problems.join('; '));
if (problems.length > 0) process.exitCode = 1;
console.log('page errors:', errors.length);
for (const line of errors.slice(0, 8)) console.log('  ', line);
console.log('screenshots + summary.json in', outDir);

await browser.close();
server.close();
