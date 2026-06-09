/**
 * Platform helpers for cross-platform keyboard hints (Mac ⌘ vs Windows Ctrl).
 * The actual key handling uses `e.metaKey || e.ctrlKey`, which covers both.
 */
const ua =
  typeof navigator !== 'undefined'
    ? navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || ''
    : '';

export const isMac = /Mac|iPhone|iPad|iPod/i.test(ua);

/** The bare modifier label for the current platform. */
export const modKeyLabel = isMac ? '⌘' : 'Ctrl';

/** A full combo label, e.g. comboLabel('K') => "⌘K" (mac) or "Ctrl+K" (win). */
export const comboLabel = (key) => (isMac ? `⌘${key}` : `Ctrl+${key}`);
