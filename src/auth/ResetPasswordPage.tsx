import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from './AuthProvider';
import { PasswordField } from './PasswordField';

/**
 * Landing page for the password-reset email link. Supabase turns the link's
 * token into a temporary recovery session automatically (detectSessionInUrl),
 * so once the user is signed in here we let them set a new password.
 */
export function ResetPasswordPage() {
  const { updatePassword, user, loading, configured } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // If they land here without a valid recovery session, nudge them to request
  // a link. (Give Supabase a moment to parse the token from the URL first.)
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1500);
    return () => clearTimeout(t);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) { setError(err); return; }
    setDone(true);
    setTimeout(() => navigate('/login', { replace: true }), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>Set a new password</h1>

        {!configured && (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">Authentication isn’t configured yet.</p>
        )}

        {done ? (
          <p className="text-sm text-green-700">Password updated. Taking you to sign in…</p>
        ) : !loading && !user && waited ? (
          <div className="text-sm text-gray-600">
            <p>This reset link is invalid or has expired.</p>
            <a href="/login" className="mt-2 inline-block underline">Request a new one</a>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <p className="mb-2 text-sm text-gray-500">Choose a new password for your account.</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">New password</span>
              <PasswordField autoComplete="new-password" value={password} onChange={setPassword} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Confirm new password</span>
              <PasswordField autoComplete="new-password" value={confirm} onChange={setConfirm} />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="mt-2 rounded-full px-6 py-3 font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
