import { useState } from 'react';

import { getSupabase } from '@/lib/supabase';

/**
 * Creator-side composer to broadcast a push notification to everyone who has
 * enabled notifications for this workspace. Calls the /api/send-push Cloudflare
 * Function, which verifies the caller is an editor and sends to all devices.
 */
export function SendNotification({
  orgId,
  orgSlug,
  onClose,
}: {
  orgId: string;
  orgSlug: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const supabase = getSupabase();
      const { data: sessionRes } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      const token = sessionRes?.session?.access_token;
      if (!token) throw new Error('Please sign in again.');

      // The server handles a slice of the devices per call, because a single
      // Cloudflare Function may only make so many outbound requests and every
      // device is one of them. Walking the slices from here is what lets a
      // broadcast reach a hundred people instead of silently reaching none.
      let offset: number | null = 0;
      let sent = 0;
      let removed = 0;
      let total = 0;
      const failures: Record<string, number> = {};
      let guard = 0;

      while (offset !== null && guard < 100) {
        guard += 1;
        const res = await fetch('/api/send-push', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orgId, title, message, url: `/o/${orgSlug}`, offset }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          sent?: number; removed?: number; total?: number;
          failures?: Record<string, number>; nextOffset?: number | null; error?: string;
        };
        if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
        sent += body.sent ?? 0;
        removed += body.removed ?? 0;
        total = body.total ?? total;
        for (const [k, v] of Object.entries(body.failures ?? {})) failures[k] = (failures[k] ?? 0) + v;
        offset = body.nextOffset ?? null;
        setResult(`Sending… ${sent} of ${total}`);
      }

      // Say what went wrong when something did. "Sent to 0 of 104" with no
      // reason is impossible to act on — for whoever sent it or for us.
      const reasons = Object.entries(failures).map(([k, v]) => `${v}× ${k}`).join(', ');
      setResult(
        `Sent to ${sent} of ${total} device(s).`
        + (removed ? ` ${removed} expired subscription(s) cleaned up.` : '')
        + (reasons ? ` Failed: ${reasons}.` : ''),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Send a notification</h2>
          <button type="button" onClick={onClose} className="rounded px-2 text-2xl leading-none hover:bg-black/10" aria-label="Close">×</button>
        </div>
        <p className="mb-3 text-sm text-gray-500">
          Goes to everyone who added the app and turned on notifications.
        </p>
        <label className="mb-2 block text-sm font-medium">Title</label>
        <input
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2"
          placeholder="e.g. Reminder: Huddle at 6:20pm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />
        <label className="mb-2 block text-sm font-medium">Message</label>
        <textarea
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2"
          rows={3}
          placeholder="Optional details…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={300}
        />
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {result && <p className="mb-2 text-sm text-green-700">{result}</p>}
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={send}
          className="w-full rounded-full px-6 py-3 font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
        >
          {busy ? 'Sending…' : 'Send to everyone'}
        </button>
      </div>
    </div>
  );
}
