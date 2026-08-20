/**
 * iOS's Share glyph — a box with an arrow leaving the top.
 *
 * Drawn rather than typed. The previous version used Apple's private-use
 * character for this symbol, which renders as an empty box on anything that
 * doesn't happen to have SF Pro available — so the single most important cue in
 * the whole instruction ("look for THIS button") was frequently missing. An
 * inline SVG cannot fail that way.
 */
export function ShareIcon({ className = 'h-6 w-6', title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {/* The tray, open at the top so the arrow reads as leaving it. */}
      <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 17.5 11H16" />
      {/* The arrow. */}
      <path d="M12 15V4" />
      <path d="M8.5 7.5 12 4l3.5 3.5" />
    </svg>
  );
}
