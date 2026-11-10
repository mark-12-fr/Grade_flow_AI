/** A small "?" that explains a term on hover or focus. */

/** A small "?" that explains a term on hover, keyboard focus or tap. The text is also read out by screen readers. */
export function Hint({ text }: { text: string }) {
  return <span className="hint" tabIndex={0} role="note" aria-label={text} data-tip={text}>?</span>;
}
