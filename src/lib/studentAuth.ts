/**
 * Turning a typed phone number into the address a student's account hangs on.
 *
 * Students sign up without an email, so Supabase gets a derived one. The
 * student never sees it and never types it — they type their phone number and
 * this works out the rest.
 *
 * Kept in step with normalizePhone()/studentEmail() in
 * functions/api/student-signup.ts and normalize_phone() in migration 0064. All
 * three have to agree, or an account gets created under one address and looked
 * for under another.
 */

const STUDENT_EMAIL_DOMAIN = 'students.switchleaderapp.com';

/** Digits only, last ten. Null when there aren't enough digits to be a number. */
export function normalizePhone(raw: string): string | null {
  const d = (raw || '').replace(/[^0-9]/g, '');
  if (!d) return null;
  return d.length > 10 ? d.slice(-10) : d;
}

export function studentEmail(phoneKey: string): string {
  return `s${phoneKey}@${STUDENT_EMAIL_DOMAIN}`;
}

/** Does this look like someone typing a phone number rather than an email? */
export function looksLikePhone(input: string): boolean {
  const s = (input || '').trim();
  if (!s || s.includes('@')) return false;
  const digits = s.replace(/[^0-9]/g, '');
  // Everything that isn't a digit has to be phone punctuation, so "Bob" and
  // "my.name" aren't mistaken for a number with no digits in it.
  return digits.length >= 10 && /^[0-9()\-.\s+]+$/.test(s);
}

/**
 * What to hand Supabase for a sign-in. A phone number becomes the derived
 * student address; anything else is passed through as the email it is.
 */
export function signInIdentifier(input: string): string {
  const s = (input || '').trim();
  if (!looksLikePhone(s)) return s;
  const key = normalizePhone(s);
  return key ? studentEmail(key) : s;
}

/** Graduation years worth offering: this school year's seniors, and up. */
export function gradYearOptions(now = new Date()): number[] {
  const y = now.getUTCFullYear();
  // From August the school year has rolled over, so the current seniors
  // graduate next calendar year.
  const seniorYear = now.getUTCMonth() >= 7 ? y + 1 : y;
  return [0, 1, 2, 3, 4, 5, 6].map((i) => seniorYear + i);
}

/**
 * Under 13 on the day you ask.
 *
 * Switch takes 6th graders, so this is a real population, and it decides
 * whether a parent has to agree before the student can be put in a group chat.
 * A missing birthday counts as under 13: not knowing someone's age should cost
 * a leader a phone call, not let a child straight into a conversation.
 *
 * Mirrors is_under_13() in migration 0077, which is the copy that enforces it.
 */
export function isUnder13(birthday: string | null | undefined, now = new Date()): boolean {
  if (!birthday) return true;
  const b = new Date(`${birthday}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return true;
  const thirteenth = new Date(Date.UTC(
    b.getUTCFullYear() + 13, b.getUTCMonth(), b.getUTCDate(),
  ));
  return now.getTime() < thirteenth.getTime();
}

/** "12th Grade" for a graduation year, or null once they've graduated. */
export function gradeFromGradYear(gradYear: number, now = new Date()): string | null {
  const y = now.getUTCFullYear();
  const seniorYear = now.getUTCMonth() >= 7 ? y + 1 : y;
  const grade = 12 - (gradYear - seniorYear);
  if (grade < 6 || grade > 12) return null;
  return `${grade}th Grade`;
}
