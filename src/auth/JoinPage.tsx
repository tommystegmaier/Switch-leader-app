import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useRedeemInvite } from '@/data/inviteHooks';
import { useAuth } from './AuthProvider';

/**
 * Redeems an invite code to join an invite-only workspace. Requires sign-in;
 * unauthenticated visitors are bounced to /login and returned here afterward.
 */
export function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const redeem = useRedeemInvite();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      const next = `/join${params.get('code') ? `?code=${params.get('code')}` : ''}`;
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    }
  }, [loading, user, params, navigate]);

  async function onJoin() {
    setError(null);
    try {
      const slug = await redeem.mutateAsync(code);
      navigate(`/o/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--th-heading)' }}>Join a workspace</h1>
      <p className="mb-6 text-sm text-gray-500">Enter the invite code you were given.</p>
      <input
        className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2"
        placeholder="invite code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={onJoin}
        disabled={redeem.isPending || !code.trim()}
        className="w-full rounded-full px-6 py-3 font-semibold disabled:opacity-50"
        style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
      >
        {redeem.isPending ? 'Joining…' : 'Join'}
      </button>
    </div>
  );
}
