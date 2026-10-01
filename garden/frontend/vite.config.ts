import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // Relative base so the build can be dropped into any sub-directory.
  base: './',
  plugins: [vue()],
  // The chat's own `/api` is the Go server (`backend/`, `garden-server -addr :8080` by default), which knows
  // nothing but its API: the page itself is handed out by this dev/preview server — or, in a build, by
  // whatever static server stands in front of it. `/api` is proxied here rather than asked for at a full
  // address so that the page asks for a path under itself either way (`apiBase` in `src/chat/api.ts`, and
  // `VITE_API_BASE` for a build put somewhere the API is not under); in a deployment both stand behind one
  // address, behind a reverse proxy. Without the Go server running, the chat keeps its log empty and says
  // so in the console.
  server: {
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  preview: {
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
