/**
 * Small gap-fillers for phones that haven't been updated.
 *
 * Imported FIRST in main.tsx, before React or anything else, so it is in place
 * before any other code runs.
 *
 * `URL.parse` only arrived in Safari 18.4 (March 2025). On an iPhone a version
 * or two behind it is simply missing, and anything that calls it throws
 * "URL.parse is not a function" — which React Router turns into a full-screen
 * "Unexpected Application Error". That is what people on older phones saw when
 * they opened a page with a PDF on it: pdf.js calls URL.parse the moment it is
 * handed a file to load.
 *
 * The PDF viewer itself now uses pdf.js's own "legacy" build, which carries a
 * fuller set of these. This one stays because it protects the WHOLE app — any
 * library we add later that reaches for URL.parse would take a page down the
 * same way, and there is no reason to wait for that to happen on someone's
 * phone to find out.
 */

// `URL.parse` is the non-throwing twin of `new URL()`: null instead of an
// exception when the string isn't a valid URL. That's the entire difference,
// and the entire polyfill.
if (typeof URL.parse !== 'function') {
  URL.parse = function parse(url: string | URL, base?: string | URL): URL | null {
    try {
      return base === undefined ? new URL(url) : new URL(url, base);
    } catch {
      return null;
    }
  };
}

// Same idea, same vintage (Safari 17). Answers "would URL.parse succeed?".
if (typeof URL.canParse !== 'function') {
  URL.canParse = function canParse(url: string | URL, base?: string | URL): boolean {
    return URL.parse(url, base) !== null;
  };
}

export {};
