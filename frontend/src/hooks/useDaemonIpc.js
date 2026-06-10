/**
 * useDaemonIpc — connect the browser app to the AudioDaemon IPC channel.
 *
 * Surfaces TRIGGER_EVENT / FOCUS_WINDOW only on the elected primary tab so a
 * trigger broadcast to every open tab is shown once. Every tab still connects and
 * auto-ACKs (the daemon resolves on the first ACK).
 */
import { useEffect } from 'react';
import { daemonIpc } from '../api/daemonIpc';
import { MSG } from '../lib/ipcProtocol';
import { electPrimary } from '../lib/primaryTab';

export function useDaemonIpc({ onTrigger, onFocus } = {}) {
  useEffect(() => {
    const election = electPrimary();

    daemonIpc.onMessage = (type, payload) => {
      if (!election.isPrimary()) return; // single-instance: only primary tab surfaces
      if (type === MSG.TRIGGER_EVENT) onTrigger?.(payload);
      else if (type === MSG.FOCUS_WINDOW || type === MSG.SHOW_WINDOW) onFocus?.(payload);
    };
    daemonIpc.connect();

    return () => {
      daemonIpc.onMessage = () => {};
      election.destroy();
      // keep the connection alive across hot-reloads / remounts; stop() only on full teardown
    };
  }, [onTrigger, onFocus]);

  return daemonIpc;
}
