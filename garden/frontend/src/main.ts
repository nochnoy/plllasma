import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { chatApi, Refused } from './chat/api';
import type { User } from './auth';

/**
 * The page's own first act: the handshake. The token out of the site's cookie is handed to the game's
 * server, and everything waits — on the black screen the page already is, with the one word `index.html`
 * left on it — until the site's player comes back with it. Only then is there a game to mount, because
 * there is nobody to play it before that: no name to sign a line with, and no run to record.
 *
 * A handshake that fails is the page's whole answer, in the player's own language rather than the
 * server's English (`Refused`): «не вошли» for a token the site would not answer for — the game lives
 * inside a site that has to be signed into first — and «не дозвонились» for everything else, with the
 * sentence left in the console for whoever is holding the other end of the wire.
 */
try {
  const user: User = await chatApi().auth();
  createApp(App, { user }).mount('#app');
} catch (err) {
  console.warn('[free-falling-girl] the page could not sign its player in:', err);
  const said = document.createElement('p');
  said.className = 'loading';
  said.textContent = err instanceof Refused && err.status === 401
    ? 'Вы не вошли на сайт.'
    : 'Сайт не ответил: попробуйте ещё раз.';
  const app = document.getElementById('app');
  const loading = app?.querySelector('.loading');
  if (app && loading) loading.replaceWith(said);
}
