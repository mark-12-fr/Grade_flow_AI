'use client';

/** A value on a form that can be typed over in place (Enter saves, Esc cancels). */

import { useLayoutEffect, useRef } from 'react';

/**
 * A value on a printed form that can be typed over in place. It is saved when the cursor leaves it;
 * Enter saves, Esc cancels. `onCommit` may refuse a value by calling `reject()`, and the old text comes back.
 */
export function Editable({ value, onCommit, className = '', label = 'Edit value' }: { value: string; onCommit: (value: string) => void; className?: string; label?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  // The browser owns the text while it is being typed; only refresh it from the data when it is not focused.
  useLayoutEffect(() => {
    const node = ref.current;
    if (node && document.activeElement !== node && node.textContent !== value) node.textContent = value;
  });
  return (
    <span ref={ref} className={`sf10-ed ${className}`} contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-label={label}
      onBlur={(e) => {
        const node = e.currentTarget;
        const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text !== value) onCommit(text);
        node.textContent = value; // shows the saved value; if it changed, the next render brings the new one
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { e.currentTarget.textContent = value; e.currentTarget.blur(); }
      }}
      onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' ')); }} />
  );
}
