import { InteractionManager } from 'react-native';

let fired = false;
const queue: Array<() => void> = [];

/**
 * Signal that the first post-auth screen has painted (navigation ready).
 * Idempotent — only the first call schedules work.
 */
export function markFirstInteractiveFrame(): void {
  if (fired) return;
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      if (fired) return;
      fired = true;
      const pending = queue.splice(0, queue.length);
      pending.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.warn('[deferredStartup] callback failed:', e);
        }
      });
    });
  });
}

/** Run once after markFirstInteractiveFrame (or immediately if already fired). */
export function onAfterFirstInteractiveFrame(cb: () => void): void {
  if (fired) {
    cb();
    return;
  }
  queue.push(cb);
}
