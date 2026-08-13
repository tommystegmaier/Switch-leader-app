/**
 * A short haptic tap, the way a native long-press confirms itself.
 *
 * Android/Chrome expose the Vibration API. Safari never implemented it, so on
 * iOS we use the known switch-input trick: programmatically clicking a <label>
 * bound to an `<input type="checkbox" switch>` fires the Taptic Engine (Safari
 * 17.4+). The click must go through the label — clicking the input directly
 * does nothing.
 *
 * Best-effort by design: Apple reportedly closed this in iOS 26.5, and it was
 * never a supported API, so it silently no-ops where unavailable. Nothing in
 * the UI depends on it firing.
 */

let label: HTMLLabelElement | null = null;

function ensureSwitch(): HTMLLabelElement | null {
  if (typeof document === 'undefined') return null;
  if (label?.isConnected) return label;
  try {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.id = `haptic-${Math.random().toString(36).slice(2)}`;
    const el = document.createElement('label');
    el.htmlFor = input.id;
    // Kept out of the layout and away from assistive tech.
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none';
    wrap.append(input, el);
    document.body.appendChild(wrap);
    label = el;
    return el;
  } catch {
    return null;
  }
}

/** Fire a short tap. Safe to call anywhere; does nothing where unsupported. */
export function tapHaptic(): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
      return;
    }
    ensureSwitch()?.click();
  } catch { /* haptics are a nicety, never a requirement */ }
}
