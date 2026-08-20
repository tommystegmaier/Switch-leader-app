import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useInviteInfo, useRedeemInvite } from '@/data/inviteHooks';
import { errorMessage } from '@/lib/errors';
import { clearPendingInvite, rememberInvite } from '@/lib/pendingInvite';
import { useAuth } from './AuthProvider';

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

  // Pre-fill whatever the invite is addressed to once it loads. The phone
  // matters more than the email here: the account has to match the number on
  // the invite, and someone typing their own number a different way is the
  // easiest way to get locked out of a link meant for them.
  useEffect(() => {
    if (info?.email && !email) setEmail(info.email);
  }, [info?.email]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (info?.phone && !phone) setPhone(info.phone);
  }, [info?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stash the code immediately. Creating an account here doesn't necessarily
  // sign you in — with email confirmation on, the person leaves for their inbox
  // and comes back through a plain sign-in, by which point the code is only in
  // the URL of a page they've closed. Remembering it lets the join finish later.
  useEffect(() => { if (code) rememberInvite(code); }, [code]);

  // If already signed in, join with one tap (handled by the button below).
  async function doRedeem() {
    const slug = await redeem.mutateAsync(code);
    clearPendingInvite();
    navigate(`/o/${slug}`, { replace: true });
  }

  async function onAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === 'signup' && (!name.trim() || !birthday.trim() || !phone.trim())) {
      setError('Please add your name, birthday, and phone number to create your account.');
      return;
    }
    setBusy(true);
    try {
      const { error: err, signedIn } =
        mode === 'signup'
          ? await signUp(email.trim(), password, { name, birthday, phone })
          : { ...(await signIn(email.trim(), password)), signedIn: true };
      if (err) {
        // "You already have an account" is a dead end when the page is sitting
        // on the sign-up form: the fix is to sign in instead, and the person
        // has no way of knowing that. Do it for them rather than reporting it.
        if (mode === 'signup' && /already (registered|exists)|already been registered|User already/i.test(err)) {
          setMode('signin');
          setError(null);
          setNotice('You already have an account — enter your password to sign in and join.');
          setBusy(false);
          return;
        }
        setError(err);
        setBusy(false);
        return;
      }
      // Sign-up only signs you in when email confirmation is off, so whether we
      // can join right now comes straight from the sign-up response. This used
      // to be a guess: wait 400ms, then look for a session. On a slow phone the
      // session wasn't visible yet, so it took the "check your email" branch,
      // never redeemed the code, and left the person with an account belonging
      // to no app — intermittently, which is the worst kind.
      if (mode === 'signup' && !signedIn) {
        setNotice('Account created! Check your email to confirm it, then sign in — you’ll be added to the app automatically.');
        setBusy(false);
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

  const workspace = info?.appName ?? 'this app';
  const logo = info?.iconUrl || info?.logoUrl || null;
  // Brand the page with the app's colors (fall back to theme defaults).
  const brandPrimary = info?.primaryColor || 'var(--th-primary)';
  const brandPrimaryText = info?.primaryText || 'var(--th-primary-text)';
  const brandHeading = info?.headingColor || 'var(--th-heading)';

  return (
    <Shell>
      <div className="mb-6 text-center">
        {logo && <img src={logo} alt="" className="mx-auto mb-4 h-20 w-20 rounded-2xl object-cover shadow-sm" />}
        <h1 className="text-2xl font-bold" style={{ color: brandHeading }}>You&apos;re invited</h1>
        {infoLoading ? (
          <p className="mt-2 text-sm text-gray-500">Checking your invitation…</p>
        ) : info && !info.valid ? (
          <p className="mt-2 text-sm text-red-600">This invitation has expired. Ask for a new link.</p>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            You&apos;ve been invited to join <span className="font-semibold" style={{ color: brandHeading }}>{workspace}</span>!
          </p>
        )}
      </div>

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
            style={{ backgroundColor: brandPrimary, color: brandPrimaryText }}
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
                <input type="text" required autoComplete="name" placeholder="e.g. Jordan Smith" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
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

          <button type="submit" disabled={busy || !configured} className="mt-1 w-full rounded-full px-6 py-3 font-semibold disabled:opacity-50" style={{ backgroundColor: brandPrimary, color: brandPrimaryText }}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account & join' : 'Sign in & join'}
          </button>

          <button type="button" onClick={() => { setMode((m) => (m === 'signup' ? 'signin' : 'signup')); setError(null); setNotice(null); }} className="text-sm underline">
            {mode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one'}
          </button>

          {/* People are handing over a phone number and birthday on this screen;
              the policy saying what happens to them belongs on it. */}
          <Link to="/privacy" className="mt-2 self-start text-xs text-gray-400 underline">Privacy Policy</Link>
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
