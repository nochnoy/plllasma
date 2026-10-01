import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue';
import { Game } from '../game/game';

/**
 * Mounts the game engine on a host element and tears it down with the component.
 *
 * The engine is deliberately kept out of Vue's reactivity: nothing in the interface needs
 * to change while it runs, so the composable only owns the lifetime.
 */
export function useGame(host: Ref<HTMLElement | null>) {
  const game = shallowRef<Game | null>(null);
  const error = shallowRef<string | null>(null);

  onMounted(async () => {
    if (!host.value) return;
    try {
      game.value = await Game.create(host.value);
      // Handle used by the headless smoke test (tools/smoke.mjs) to inspect and steer the
      // simulation without hunting for DOM nodes.
      (window as unknown as { __garden?: Game }).__garden = game.value;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'не удалось запустить рендерер';
      console.error('[free-falling-girl] init failed', cause);
    }
  });

  onBeforeUnmount(() => {
    game.value?.dispose();
    game.value = null;
  });

  return { game, error };
}
