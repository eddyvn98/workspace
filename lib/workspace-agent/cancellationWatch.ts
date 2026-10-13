export function watchWorkspaceTurnCancellation(
  isCancelled: () => Promise<boolean>,
  onCancelled: () => void,
  pollIntervalMs = 250,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };

  const poll = async () => {
    if (stopped) return;
    try {
      if (await isCancelled()) {
        stop();
        onCancelled();
        return;
      }
    } catch {
      // A transient status read failure must not disable cancellation polling.
    }
    if (!stopped) timer = setTimeout(() => void poll(), pollIntervalMs);
  };

  timer = setTimeout(() => void poll(), pollIntervalMs);
  return stop;
}
