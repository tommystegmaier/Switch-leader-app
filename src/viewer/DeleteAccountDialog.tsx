import { useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { getSupabase } from '@/lib/supabase';

/**
 * Delete your own account, permanently.
 *
 * Required by both app stores: an app that lets you make an account has to let
 * you destroy it from inside the app, without emailing anyone to ask.
 *
 * The entry point is deliberately quiet and the confirmation deliberately is
 * not. Nothing here is recoverable, so the dialog spells out exactly what goes,
 * and typing the word is what arms the button — a mis-tap can't do this.
 */
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = typed.trim().toUpperCase() === 'DELETE';

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const s = getSupabase();
      const { data } = (await s?.auth.getSession()) ?? { data: { session: null } };
      const token = data.session?.access_token;
      if (!token) throw new Error('Please sign in again and retry.');

      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not delete the account.');

      // The account is gone, so the session is meaningless — clear it and land
      // somewhere that doesn't try to load a workspace they're no longer in.
      await signOut();
      window.location.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-t-3xl p-5 shadow-2xl sm:rounded-3xl"
        style={{ backgroundColor: 'var(--th-surface)', paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      >
        <h2 className="text-xl font-bold" style={{ color: 'var(--th-heading)' }}>Delete your account?</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--th-text)' }}>
          This permanently removes <strong>{user?.email}</strong> — your profile, your messages in every
          group chat, and your place on every team.
        </p>
        <p className="mt-2 text-sm font-semibold text-red-600">This cannot be undone.</p>

        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="font-medium">Type DELETE to confirm</span>
          <input
            className="rounded-md border px-3 py-2 text-base"
            style={{ borderColor: 'var(--th-hairline-strong)' }}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
        </label>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void run()}
            disabled={!armed || busy}
            className="w-full rounded-full px-6 py-3 text-base font-semibold text-white disabled:opacity-40"
            style={{ backgroundColor: '#dc2626' }}
          >
            {busy ? 'Deleting…' : 'Delete my account forever'}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="w-full rounded-full px-6 py-3 text-sm font-medium" style={{ color: 'var(--th-text)' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
