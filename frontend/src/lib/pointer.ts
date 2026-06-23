// Single shared pointer tracker. Proximity effects (the kinetic title, the glow
// text) subscribe to viewport cursor coordinates instead of each registering its
// own window listener — so they can react as the cursor *approaches* from
// anywhere on the page without N independent move handlers firing. Updates are
// throttled to one batch per animation frame.

type PointerListener = (x: number, y: number) => void;

const listeners = new Set<PointerListener>();
let attached = false;
let frame = 0;
let queued = false;
// Start far off-screen so nothing reacts until the pointer actually moves.
let lastX = -9999;
let lastY = -9999;

function flush() {
  queued = false;
  for (const listener of listeners) listener(lastX, lastY);
}

function handleMove(event: PointerEvent) {
  lastX = event.clientX;
  lastY = event.clientY;
  if (!queued) {
    queued = true;
    frame = requestAnimationFrame(flush);
  }
}

// Subscribe to cursor position. Returns an unsubscribe function that also tears
// down the shared listener once the last subscriber leaves.
export function subscribePointer(listener: PointerListener): () => void {
  listeners.add(listener);
  if (!attached) {
    window.addEventListener("pointermove", handleMove, { passive: true });
    attached = true;
  }
  // Prime with the last known position so a freshly mounted effect isn't blank.
  listener(lastX, lastY);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && attached) {
      window.removeEventListener("pointermove", handleMove);
      cancelAnimationFrame(frame);
      attached = false;
      queued = false;
    }
  };
}
