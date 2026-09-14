import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useInviteInfo } from '@/data/inviteHooks';
import { getSupabase } from '@/lib/supabase';
import { gradYearOptions, isUnder13, normalizePhone } from '@/lib/studentAuth';

/**
 * Student sign-up, reached from the link a Youth Pastor sends out.
 *
 * Deliberately not the same page as the leader invite. A student has no email
 * address to give, so asking for one and then explaining why it's optional is
 * worse than not asking. The fields here are the five that matter and nothing
 * else — this is being filled in on a phone, probably in a crowded room, by
 * someone who will give up if it looks like paperwork.
 *
 * The account is created by /api/student-signup rather than in the browser,
 * because there is no email to confirm and only the server can make an account
 * that skips that step.
 */
export function StudentJoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = (params.get('code') ?? '').trim();
  const { data: info, isLoading: infoLoading } = useInviteInfo(code || undefined);

  const [name, setName] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [birthday, setBirthday] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set once the account exists and a parent still has to agree.
  const [consentToken, setConsentToken] = useState<string | null>(null);

  const years = gradYearOptions();
  const phoneKey = normalizePhone(phone);
  // Only asked once a birthday is typed, so the form doesn't change shape
  // while somebody is halfway through the date.
  const needsParent = birthday !== '' && isUnder13(birthday);
  const ready = name.trim().length >= 2
    && gradYear !== ''
    && birthday !== ''
    && (phoneKey?.length ?? 0) >= 10
    && password.length >= 8
    && (!needsParent || (parentName.trim().length >= 2 && (normalizePhone(parentPhone)?.length ?? 0) >= 10));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/student-signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code, name, gradYear: Number(gradYear), birthday, phone, password,
          parentName, parentPhone,
        }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        email?: string; error?: string; consentToken?: string | null;
      };
      if (!res.ok || !out.email) throw new Error(out.error || 'Could not create your account.');

      // Sign in with the address the server derived. The student never sees it
      // — from here on they sign in with their phone number.
      const supabase = getSupabase();
      if (!supabase) throw new Error('Sign-in is not configured.');
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: out.email,
        password,
      });
      if (signInErr) {
        // The account exists, so send them to sign in rather than leaving them
        // staring at a form that would now say "already registered".
        navigate('/login', { replace: true });
        return;
      }
      // An under-13 is signed in, but can't be in a group chat until a parent
      // agrees. Show them the link now, while a parent is most likely to be
      // within arm's reach, instead of leaving it for a leader to chase.
      if (out.consentToken) { setConsentToken(out.consentToken); return; }
      navigate(info?.orgSlug ? `/o/${info.orgSlug}` : '/workspaces', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-lg border border-gray-300 px-3 py-3 text-base';

  if (!code) {
    return (
      <Shell>
        <p className="text-center text-gray-600">
          This sign-up link is missing its code. Ask your leader to send it again.
        </p>
      </Shell>
    );
  }

  if (infoLoading) {
    return <Shell><p className="text-center text-gray-500">Checking your link…</p></Shell>;
  }

  if (!info || !info.valid) {
    return (
      <Shell>
        <p className="text-center text-gray-600">
          That sign-up link isn&rsquo;t working any more. Ask your leader for a new one.
        </p>
      </Shell>
    );
  }

  // A leader invite opened at the student address. Send them to the right form
  // rather than quietly signing a leader up as a student — the server would
  // refuse it anyway, and this explains why.
  if (info.role !== 'student') {
    return (
      <Shell>
        <p className="mb-4 text-center text-gray-600">
          This is a leader invitation, not a student sign-up link.
        </p>
        <Link
          to={`/join?code=${encodeURIComponent(code)}`}
          className="block rounded-full px-6 py-3 text-center font-semibold"
          style={{ backgroundColor: 'var(--th-primary, #0f1420)', color: 'var(--th-primary-text, #fff)' }}
        >
          Continue as a leader
        </Link>
      </Shell>
    );
  }

  // Account made, waiting on a parent. Shown instead of dropping them into an
  // app where every chat is missing with no explanation.
  if (consentToken) {
    const link = `${window.location.origin}/consent?token=${consentToken}`;
    return (
      <Shell>
        <h1 className="mb-2 text-center text-2xl font-bold">You&rsquo;re signed up</h1>
        <p className="mb-4 text-center text-sm text-gray-600">
          Because you&rsquo;re under 13, a parent or guardian has to say it&rsquo;s okay before you
          can join group chats. Everything else is ready now.
        </p>
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--th-hairline, #e5e7eb)' }}>
          <p className="mb-2 text-sm font-semibold">Show this to {parentName.trim().split(' ')[0] || 'your parent'}</p>
          <button
            type="button"
            onClick={() => { void navigator.clipboard?.writeText(link); }}
            className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-left text-xs break-all"
          >
            {link}
          </button>
          <a
            href={link}
            className="block rounded-full px-6 py-3 text-center font-semibold"
            style={{ backgroundColor: 'var(--th-primary, #0f1420)', color: 'var(--th-primary-text, #fff)' }}
          >
            Open it now
          </a>
          <p className="mt-2 text-xs text-gray-500">
            If they&rsquo;re here, hand them your phone and tap Open. Otherwise copy the link and
            send it to them — your leader can send it again later too.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(info?.orgSlug ? `/o/${info.orgSlug}` : '/workspaces', { replace: true })}
          className="mt-4 w-full rounded-full border border-gray-300 px-6 py-3 font-semibold"
        >
          Skip for now
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mb-1 text-center text-2xl font-bold">Set up your account</h1>
      <p className="mb-5 text-center text-sm text-gray-500">
        {info.orgName ? `Joining ${info.orgName}` : 'Joining Switch'}
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium">
          Your name
          <input
            className={`mt-1 ${field}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and last"
            autoComplete="name"
            required
          />
        </label>

        <label className="text-sm font-medium">
          When do you graduate?
          <select
            className={`mt-1 ${field}`}
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value)}
            required
          >
            <option value="">Choose a year…</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>

        <label className="text-sm font-medium">
          Birthday
          <input
            type="date"
            className={`mt-1 ${field}`}
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            required
          />
        </label>

        {needsParent && (
          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--th-hairline, #e5e7eb)' }}>
            <p className="text-sm font-semibold">One more thing</p>
            <p className="mt-1 text-xs text-gray-600">
              You&rsquo;re under 13, so a parent or guardian needs to say it&rsquo;s okay before you can
              join any group chats. We&rsquo;ll show you a link for them at the end.
            </p>
            <label className="mt-3 block text-sm font-medium">
              Parent or guardian&rsquo;s name
              <input
                className={`mt-1 ${field}`}
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder="First and last"
                required
              />
            </label>
            <label className="mt-2 block text-sm font-medium">
              Their phone number
              <input
                type="tel"
                className={`mt-1 ${field}`}
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                placeholder="(555) 555-5555"
                required
              />
            </label>
          </div>
        )}

        <label className="text-sm font-medium">
          Phone number
          <input
            type="tel"
            className={`mt-1 ${field}`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-5555"
            autoComplete="tel"
            required
          />
          <span className="mt-1 block text-xs font-normal text-gray-500">
            This is how you&rsquo;ll sign in — there&rsquo;s no email to remember.
          </span>
        </label>

        <label className="text-sm font-medium">
          Make a password
          <input
            type="password"
            className={`mt-1 ${field}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!ready || busy}
          className="mt-1 w-full rounded-full px-6 py-3 text-base font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--th-primary, #0f1420)', color: 'var(--th-primary-text, #fff)' }}
        >
          {busy ? 'Setting up…' : 'Create my account'}
        </button>

        <p className="mt-1 text-center text-xs text-gray-500">
          Already set up? <Link to="/login" className="underline">Sign in</Link>
        </p>
        <p className="text-center text-xs text-gray-400">
          <Link to="/privacy" className="underline">Privacy policy</Link>
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <div className="mb-6 flex flex-col items-center gap-2">
        <img src="/icon-192.png" alt="" className="h-16 w-16 rounded-2xl" />
        <p className="text-lg font-bold">Switch Leader App</p>
      </div>
      {children}
    </div>
  );
}
