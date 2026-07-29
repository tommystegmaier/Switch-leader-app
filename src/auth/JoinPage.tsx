import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useInviteInfo, useRedeemInvite } from '@/data/inviteHooks';
import { errorMessage } from '@/lib/errors';
import type { Role } from '@/types';
import { useAuth } from './AuthProvider';

const ROLE_WORD: Record<Role, string> = {
  owner: 'an Owner',
  admin: 'an Admin',
  editor: 'an Editor',
  viewer: 'a Viewer',
};

/**
 * Accept-an-invitation page. Unlike a plain login, this shows what the invite
 * grants (workspace + role) and lets the person create their account (or sign
 * in) right here — then it redeems the code automatically and drops them into
 * the workspace. No confusing detour through a generic login screen.
 */
export function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, signIn, signUp, configured } = useAuth();
  const redeem = useRedeemInvite();

  const code = (params.get('code') ?? '').trim();
  const { data: info, isLoading: infoLoading } = useInviteInfo(code || undefined);

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pre-fill the intended email once the invite loads.
  useEffect(() => {
    if (info?.email && !email) setEmail(info.email);
  }, [info?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // If already signed in, join with one tap (handled by the button below).
  async function doRedeem() {
    const slug = await redeem.mutateAsync(code);
    navigate(`/o/${slug}`, { replace: true });
  }

  async function onAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'signup' && (!birthday.trim() || !phone.trim())) {
      setError('Please add your birthday and phone number to create your account.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } =
        mode === 'signup'
          ? await signUp(email.trim(), password, { name, birthday, phone })
          : await signIn(email.trim(), password);
      if (err) { setError(err); setBusy(false); return; }
      // signUp may or may not create an immediate session (depends on whether
      // email confirmation is on). If we're signed in now, redeem right away.
      if (mode === 'signup') {
        // Give the auth state a beat to settle, then check.
        setTimeout(async () => {
          const { getSupabase } = await import('@/lib/supabase');
          const s = getSupabase();
          const { data } = (await s?.auth.getSession()) ?? { data: { session: null } };
          if (data.session) {
            try { await doRedeem(); } catch (er) { setError(errorMessage(er)); setBusy(false); }
          } else {
            setNotice('Account created! Check your email to confirm it, then open this invite link again to finish joining.');
            setBusy(false);
          }
        }, 400);
        return;
      }
      await doRedeem();
    } catch (er) {
      setError(errorMessage(er));
      setBusy(false);
    }
  }

  if (!code) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>Join a workspace</h1>
        <p className="mt-2 text-sm text-gray-600">This link is missing its invite code. Ask whoever invited you to send the full link again.</p>
      </Shell>
    );
  }

  const roleWord = info ? ROLE_WORD[info.role] : 'a member';
  const workspace = info?.orgName ?? 'a workspace';

  return (
    <Shell>
      <h1 className="text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>You&apos;re invited</h1>
      {infoLoading ? (
        <p className="mt-2 text-sm text-gray-500">Checking your invitation…</p>
      ) : info && !info.valid ? (
        <p className="mt-2 text-sm text-red-600">This invitation has expired. Ask for a new link.</p>
      ) : (
        <p className="mt-2 text-sm text-gray-600">
          You&apos;ve been invited to join <span className="font-semibold">{workspace}</span> as <span className="font-semibold">{roleWord}</span>.
        </p>
      )}

      {!configured && (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">Sign-in isn&apos;t configured yet.</p>
      )}

      {/* Already signed in: one-tap accept. */}
      {!loading && user ? (
        <div className="mt-6">
          <p className="text-sm text-gray-600">Signed in as {user.email}.</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={async () => { setBusy(true); setError(null); try { await doRedeem(); } catch (er) { setError(errorMessage(er)); setBusy(false); } }}
            disabled={busy}
            className="mt-3 w-full rounded-full px-6 py-3 font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
          >
            {busy ? 'Joining…' : `Accept & join ${workspace}`}
          </button>
        </div>
      ) : (
        /* Not signed in: create account (or sign in) inline. */
        <form onSubmit={onAuthSubmit} className="mt-6 flex flex-col gap-3">
          <p className="text-sm font-medium">{mode === 'signup' ? 'Create your account to accept' : 'Sign in to accept'}</p>
          {mode === 'signup' && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Your name</span>
                <input type="text" autoComplete="name" placeholder="e.g. Jordan Smith" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Birthday</span>
                <input type="date" required autoComplete="bday" value={birthday} onChange={(e) => setBirthday(e.target.value)} className={inputCls} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Phone number</span>
                <input type="tel" required autoComplete="tel" placeholder="(555) 555-5555" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={Boolean(info?.email)}
              className={`${inputCls} ${info?.email ? 'bg-gray-100 text-gray-600' : ''}`}
            />
            {info?.email && (
              <span className="text-xs text-gray-500">This invitation is for {info.email} — use this address to accept.</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Password</span>
            <input type="password" required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}

          <button type="submit" disabled={busy || !configured} className="mt-1 w-full rounded-full px-6 py-3 font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account & join' : 'Sign in & join'}
          </button>

          <button type="button" onClick={() => { setMode((m) => (m === 'signup' ? 'signin' : 'signup')); setError(null); setNotice(null); }} className="text-sm underline">
            {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one'}
          </button>
        </form>
      )}
    </Shell>
  );
}

const inputCls = 'rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-sm px-4 py-12">{children}</div>
  );
}
