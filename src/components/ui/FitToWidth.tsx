'use client';

/** Shrinks a fixed-width page to fit a narrow screen, with an "Actual size" switch. */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Shows a fixed-width page (like the A4 report card) shrunk to fit a narrow screen, so a phone does not need
 * sideways scrolling to read it. A button switches to "Actual size" for careful editing. On wide screens it does nothing.
 */
export function FitToWidth({ width, children }: { width: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  const [fit, setFit] = useState(true);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const narrow = available > 0 && available < width;
  const scale = fit && narrow ? Math.max(0.3, (available - 4) / width) : 1;
  return (
    <div className="fit-width" ref={box}>
      {narrow && (
        <div className="fit-width-bar">
          <button type="button" className="btn btn-secondary btn-sm" aria-pressed={fit} onClick={() => setFit((f) => !f)}>
            {fit ? 'Actual size (scroll sideways)' : 'Fit to screen'}
          </button>
        </div>
      )}
      <div className="fit-width-page" style={{ zoom: scale } as CSSProperties}>{children}</div>
    </div>
  );
}
