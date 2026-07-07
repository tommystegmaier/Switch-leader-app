import { useState } from 'react';

import { enablePush, pushConfigured, pushPermission, pushSupported } from '@/lib/push';

/**
 * Viewer-facing "Turn on notifications" control. Requests permission and
 * registers this device for the workspace's push notifications.
 */
export function NotifyButton({ orgId, className }: { orgId: string; className?: string }) {
  const [state, setState] = useState<string>(pushPermission());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pushConfigured() || !pushSupported()) return null;

  if (state === 'granted') {
    return <span className={`text-sm text-green-700 ${className ?? ''}`}>🔔 Notifications on</span>;
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await enablePush(orgId);
            setState('granted');
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-full px-4 py-2 text-sm font-semibold"
        style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
      >
        {busy ? 'Enabling…' : '🔔 Turn on notifications'}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
