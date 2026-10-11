import { onScopeDispose, ref, type Ref } from 'vue';

/**
 * Whether the window is at least `px` wide, kept current for as long as the caller lives: the
 * question is asked of a media query once and then listened to, so a window dragged across the
 * line turns the answer over without a reload — which is what lets a page carry two bodies of the
 * same thing (the chat's field, `ChatPanel.vue`) and stand in each one exactly while it fits.
 */
export function useMinWidth(px: number): Ref<boolean> {
  const query = window.matchMedia(`(min-width: ${px}px)`);
  const wide = ref(query.matches);
  const hear = (event: MediaQueryListEvent): void => {
    wide.value = event.matches;
  };
  query.addEventListener('change', hear);
  onScopeDispose(() => query.removeEventListener('change', hear));
  return wide;
}
