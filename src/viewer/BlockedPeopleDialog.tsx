import { useState } from 'react';

import { useChatBlocks, useSetChatBlock } from '@/data/chatHooks';
import { errorMessage } from '@/lib/errors';

/**
 * The people whose messages you've chosen to hide, and the way to undo it.
 *
 * Blocking is only defensible if it's reversible and you can see what you've
 * done — a block you can't find again is just a bug you inflicted on yourself.
 * The menu entry that opens this appears only when there's something in here,
 * so it costs nothing for the ~everyone who never blocks anyone.
 */
export function BlockedPeopleDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { data: blocked, isLoading } = useChatBlocks(orgId);
  const setBlock = useSetChatBlock(orgId);
  const [error, setError] = useState<string | null>(null);
  const list = blocked ?? [];

  async function unblock(userId: string) {
    setError(null);
    try { await setBlock.mutateAsync({ userId, blocked: false }); }
    catch (e) { setError(errorMessage(e)); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-sm rounded-t-3xl p-5 shadow-2xl sm:rounded-3xl"
        style={{ backgroundColor: 'var(--th-surface)', paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      >
        <h2 className="text-xl font-bold" style={{ color: 'var(--th-heading)' }}>Hidden people</h2>
        <p className="mt-1 text-sm text-gray-500">
          You don&apos;t see their messages in any chat. They were never told, and everyone else still sees them normally.
        </p>

        {isLoading ? (
          <p className="mt-4 text-sm text-gray-500">Loading…</p>
        ) : list.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">You haven&apos;t hidden anyone.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {list.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--th-hairline)' }}>
                <span className="min-w-0 truncate font-medium">{p.name || 'Someone'}</span>
                <button
                  type="button"
                  onClick={() => void unblock(p.userId)}
                  disabled={setBlock.isPending}
                  className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50"
                  style={{ borderColor: 'var(--th-hairline-strong)', color: 'var(--th-text)' }}
                >
                  Unhide
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button type="button" onClick={onClose} className="mt-5 w-full rounded-full px-6 py-3 text-sm font-medium" style={{ color: 'var(--th-text)' }}>
          Done
        </button>
      </div>
    </div>
  );
}
