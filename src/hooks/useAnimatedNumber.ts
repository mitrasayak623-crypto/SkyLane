import { useEffect, useRef, useState } from 'react';

/**
 * Smoothly animates a numeric readout (such as temperature) when the city changes.
 * Immediately jumps to the target value if the user has prefers-reduced-motion enabled.
 */
export function useAnimatedNumber(target: number, durationMs = 360): number {
  const [display, setDisplay] = useState(target);
  const previousRef = useRef(target);

  useEffect(() => {
    const startVal = previousRef.current;
    previousRef.current = target;

    if (typeof window === 'undefined') {
      setDisplay(target);
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || Math.abs(target - startVal) < 0.05) {
      setDisplay(target);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = startVal + (target - startVal) * eased;
      setDisplay(next);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, durationMs]);

  return display;
}
