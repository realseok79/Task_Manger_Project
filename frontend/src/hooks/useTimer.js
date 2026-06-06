/**
 * useTimer — Date-anchored countdown/stopwatch.
 * Expert 6. Uses wall-clock anchoring so背景 tab throttling can't drift the
 * elapsed time; interval is cleaned up on unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');

/** seconds -> "HH:MM:SS" (caps display at 23:59:59 per edge-case rule). */
export function formatHMS(totalSeconds) {
  const capped = Math.min(Math.max(totalSeconds, 0), 86399);
  const h = Math.floor(capped / 3600);
  const m = Math.floor((capped % 3600) / 60);
  const s = capped % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function useTimer(initialSeconds = 0, autoStart = false) {
  const [elapsed, setElapsed] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const anchorRef = useRef(null); // {start: Date.now(), base: seconds}
  const intervalRef = useRef(null);

  const tick = useCallback(() => {
    const { start, base } = anchorRef.current;
    setElapsed(base + Math.floor((Date.now() - start) / 1000));
  }, []);

  useEffect(() => {
    if (!isRunning) return undefined;
    anchorRef.current = { start: Date.now(), base: elapsed };
    intervalRef.current = setInterval(tick, 250); // sub-second for smooth flips
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);
  const stop = useCallback(() => {
    setIsRunning(false);
    setElapsed(0);
  }, []);
  const reset = useCallback((to = 0) => setElapsed(to), []);

  return { seconds: elapsed, time: formatHMS(elapsed), isRunning, start, pause, stop, reset };
}
