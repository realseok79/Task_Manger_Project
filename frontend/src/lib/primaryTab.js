/**
 * Lightweight cross-tab "primary" election via BroadcastChannel.
 *
 * Browser single-instance: when a trigger is broadcast to every open tab, only the
 * primary tab should surface it (and focus). Rule: the smallest live tab-id is
 * primary; tabs heartbeat every 500ms and expire peers after 1500ms. Degrades to
 * "always primary" when BroadcastChannel is unavailable (single context).
 */
export function electPrimary(onChange) {
  const id = Math.random().toString(36).slice(2);
  const peers = new Map([[id, Date.now()]]);
  let primary = id;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('teamsigma-ipc-elect') : null;

  const recompute = () => {
    const now = Date.now();
    for (const [pid, ts] of peers) {
      if (pid !== id && now - ts > 1500) peers.delete(pid);
    }
    const next = [...peers.keys()].sort()[0];
    if (next !== primary) {
      primary = next;
      onChange?.(primary === id);
    }
  };

  if (channel) {
    channel.onmessage = (e) => {
      if (e?.data?.id) {
        peers.set(e.data.id, Date.now());
        recompute();
      }
    };
    channel.postMessage({ id });
  }

  const beat = setInterval(() => {
    peers.set(id, Date.now());
    channel?.postMessage({ id });
    recompute();
  }, 500);

  setTimeout(() => onChange?.(primary === id), 0); // initial notification

  return {
    isPrimary: () => primary === id,
    destroy: () => {
      clearInterval(beat);
      if (channel) channel.close();
    },
  };
}
