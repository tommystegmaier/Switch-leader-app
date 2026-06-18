import DOMPurify from 'dompurify';

/**
 * XSS protection for any creator-entered HTML or URL.
 *
 * Rich-text (paragraph/accordion) and embed blocks store creator content, so
 * everything is sanitized before it is rendered or used in an href/src. This is
 * a non-functional requirement: never trust stored content.
 */

/** Sanitize rich-text HTML to a safe subset (no scripts, no event handlers). */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
      'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'blockquote', 'img',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'src', 'alt', 'class'],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/**
 * Validate/normalize a URL for use in href/src. Allows http(s), mailto, tel.
 * Returns null for anything else (e.g. `javascript:`), so callers can drop it.
 */
export function safeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed === '') return null;
  try {
    // Allow relative app links (start with /).
    if (trimmed.startsWith('/')) return trimmed;
    const parsed = new URL(trimmed);
    const ok = ['http:', 'https:', 'mailto:', 'tel:'];
    return ok.includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Allowlist for the `embed` block's iframe src. Only well-known providers are
 * permitted; everything else is rejected.
 */
const EMBED_ALLOWLIST = [
  'youtube.com',
  'www.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'open.spotify.com',
  'docs.google.com',
  'www.google.com',
  'maps.google.com',
  'calendar.google.com',
  'forms.gle',
  'w.soundcloud.com',
];

export function safeEmbedUrl(url: string | undefined | null): string | null {
  const clean = safeUrl(url);
  if (!clean) return null;
  try {
    const host = new URL(clean).hostname.toLowerCase();
    return EMBED_ALLOWLIST.some((h) => host === h || host.endsWith(`.${h}`))
      ? clean
      : null;
  } catch {
    return null;
  }
}
