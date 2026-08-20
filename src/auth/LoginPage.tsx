import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { applyHubMetadata, PLATFORM_NAME } from '@/lib/appMetadata';
import { useAuth } from './AuthProvider';
import { PasswordField } from './PasswordField';

/**
 * Sign in — and the front door of the whole product, since switchleaderapp.com
 * lands here for anyone not already signed in. So it carries the logo and the
 * name rather than looking like a bare form on a white page.
 *
 * There is deliberately NO way to create an account from here. Accounts exist
 * to belong to a team: one made on this page would be attached to nothing, and
 * its owner would land on an empty screen with nothing to do — which is exactly
 * the dead end that stranded several leaders. Sign-up lives on the invite page,
 * where the app being joined is already known. Supports an optional `?next=`.
 */
export function LoginPage() {
  const { signIn, sendPasswordReset, configured, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/workspaces';

  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { applyHubMetadata(); }, []);

  useEffect(() => {
    // Already signed in — bounce to the requested destination.
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    if (mode === 'reset') {
      const { error: err } = await sendPasswordReset(email.trim());
      setBusy(false);
      if (err) { setError(err); return; }
      setNotice('If that email has an account, a reset link is on its way. Open it to set a new password.');
      return;
    }

    const { error: err } = await signIn(email.trim(), password);
    setBusy(false);
    if (err) { setError(err); return; }
    navigate(next, { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center px-5" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
      <div className="w-full max-w-sm">
        {/* Masthead. The icon is the static app icon rather than a workspace's
            logo — nobody is signed in yet, so there's no workspace to ask. */}
        <div className="flex flex-col items-center text-center">
          <img src="/pwa-512.png" alt="" className="h-20 w-20 rounded-2xl" />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight" style={{ color: 'var(--th-heading)' }}>
            {PLATFORM_NAME}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {mode === 'reset'
              ? 'Enter your email and we’ll send a link to set a new password.'
              : 'Sign in to your team.'}
          </p>
        </div>

        {!configured && (
          <div className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Authentication isn&apos;t configured yet. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus-visible:ring-2"
            />
          </label>

          {mode === 'signin' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Password</span>
              <PasswordField autoComplete="current-password" value={password} onChange={setPassword} />
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}

          <button
            type="submit"
            disabled={busy || !configured}
            className="mt-2 rounded-full px-6 py-3 text-base font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Send reset link'}
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === 'signin' ? 'reset' : 'signin'); setError(null); setNotice(null); }}
            className="mt-1 text-sm underline"
            style={{ color: 'var(--th-text)' }}
          >
            {mode === 'signin' ? 'Forgot password?' : 'Back to sign in'}
          </button>
        </form>

        {/* No "create an account" link: an account made here would belong to no
            app. People join through the invite link they were sent. */}
        <p className="mt-8 text-center text-xs text-gray-500">
          New here? Ask your ministry leader for an invite link — that&apos;s how accounts are created.
        </p>

        <p className="mb-10 mt-6 text-center">
          <Link to="/privacy" className="text-xs text-gray-400 underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
