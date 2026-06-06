/**
 * useAnimations — shared motion primitives.
 * Expert 2: Motion & Interaction Designer
 *
 * Framer Motion variants + small hooks the components consume so motion
 * behaviour stays consistent (and tunable) across the app.
 */
import { useEffect, useRef, useState } from 'react';

/* ---- Reusable Framer Motion variants ----------------------------------- */

// Staggered list container: children fade-up one after another.
export const listContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

export const listItemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } },
};

// Modal overlay + content.
export const overlayVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

export const modalVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

// FAB / toast slide-up.
export const toastVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
  exit: { opacity: 0, y: 24, transition: { duration: 0.18 } },
};

/* ---- Hooks -------------------------------------------------------------- */

/**
 * useStaggeredReveal — returns variant props for a container whose children
 * should appear in sequence. `delay` (seconds) overrides the default stagger.
 */
export function useStaggeredReveal(delay = 0.06) {
  return {
    initial: 'hidden',
    animate: 'show',
    variants: {
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { staggerChildren: delay } },
    },
  };
}

/**
 * useTimerFlip — tracks the previous value so a digit string can play a flip
 * animation only on actual change. Returns a `flipKey` that changes with value.
 */
export function useTimerFlip(value) {
  const prev = useRef(value);
  const [flipKey, setFlipKey] = useState(0);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlipKey((k) => k + 1);
    }
  }, [value]);

  return flipKey;
}

/**
 * usePulse — adds `className` while `condition` is true (e.g. zombie appear,
 * timer running). Returns the class string to spread onto the element.
 */
export function usePulse(condition, className) {
  return condition ? className : '';
}

/**
 * useSlideTab — given the active index and a ref to the tab list, computes the
 * left/width of the active tab so an indicator can slide to it. Framer's
 * layoutId is the primary mechanism in FilterTabs; this is a fallback/utility.
 */
export function useSlideTab(activeIndex, deps = []) {
  const listRef = useRef(null);
  const [rect, setRect] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[activeIndex];
    if (el) setRect({ left: el.offsetLeft, width: el.offsetWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, ...deps]);

  return { listRef, rect };
}

/**
 * useRipple — imperative ripple on click. Attach `onPointerDown={createRipple}`
 * to a `.ripple-host` element.
 */
export function useRipple() {
  return function createRipple(event) {
    const host = event.currentTarget;
    const circle = document.createElement('span');
    const diameter = Math.max(host.clientWidth, host.clientHeight);
    const radius = diameter / 2;
    const box = host.getBoundingClientRect();
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - box.left - radius}px`;
    circle.style.top = `${event.clientY - box.top - radius}px`;
    circle.className = 'ripple';
    host.appendChild(circle);
    circle.addEventListener('animationend', () => circle.remove());
  };
}
