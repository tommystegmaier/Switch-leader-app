/**
 * Remember an invite code across a sign-up that doesn't finish in one sitting.
 *
 * Opening an invite link and creating an account there does NOT necessarily
 * sign you in: with email confirmation switched on, Supabase creates the user
 * and returns no session. The person then goes to their inbox, confirms, signs
 * in — and arrives with no memory of which app they were invited to, because
 * the code only ever existed in the URL of a page they've long since left. They
 * end up staring at "You don't have any apps yet", which is both wrong and
 * impossible to act on, and re-sending the link doesn't help because the second
 * attempt to sign up just reports that they already have an account.
 *
 * So the code is stashed the moment the invite page opens, and redeemed at the
 * next opportunity once there's a session — whenever and wherever that happens.
 */

const KEY = 'th-pending-invite';

export function rememberInvite(code: string): void {
  try { if (code) localStorage.setItem(KEY, code); } catch { /* private mode */ }
}

export function getPendingInvite(): string | null {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

/**
 * Always called once an attempt has been made, successful or not. A code that
 * has expired, or was addressed to somebody else, must not be retried on every
 * single load — that would replace one dead end with a permanent one.
 */
export function clearPendingInvite(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
