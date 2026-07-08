import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from './AuthProvider';

/**
 * Email + password sign-in for admins/editors.
 *
 * Viewers of public workspaces never see this — it's only reached explicitly
 * (e.g. to manage a workspace, or when an invite_only workspace requires it).
 * Supports an optional `?next=` redirect target.
 */
export function LoginPage() {
  const { signIn, signUp, sendPasswordReset, configured, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Default to the creator hub so anyone signing in (to build their own app)
  // lands on "My workspaces" rather than a specific workspace.
  const next = params.get('next') || '/workspaces';

  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

    const { error: err } =
      mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password, { name, birthday, phone });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (mode === 'signup') {
      setNotice(
        'Account created. If email confirmation is enabled, check your inbox, then sign in.',
      );
      setMode('signin');
      return;
    }
    navigate(next, { replace: true });
  }

  const title = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password';
  const submitLabel = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>
          {title}
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          {mode === 'reset'
            ? "Enter your email and we'll send you a link to set a new password."
            : "For workspace admins and editors. Viewers don't need an account."}
        </p>

        {!configured && (
          <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Authentication isn&apos;t configured yet. Set{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Your name</span>
                <input type="text" autoComplete="name" placeholder="e.g. Jordan Smith" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Birthday</span>
                <input type="date" autoComplete="bday" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Phone number</span>
                <input type="tel" autoComplete="tel" placeholder="(555) 555-5555" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2" />
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
              className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2"
            />
          </label>
          {mode !== 'reset' && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2"
              />
            </label>
          )}

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => { setMode('reset'); setError(null); setNotice(null); }}
              className="self-start text-sm underline"
            >
              Forgot password?
            </button>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-green-700">{notice}</p>}

          <button
            type="submit"
            disabled={busy || !configured}
            className="mt-2 rounded-full px-6 py-3 font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
          >
            {busy ? 'Please wait…' : submitLabel}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            setError(null);
            setNotice(null);
          }}
          className="mt-4 text-sm underline"
        >
          {mode === 'signin'
            ? 'Need an account? Create one'
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
