import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { getSupabase } from '@/lib/supabase';

/**
 * The page a parent or guardian opens to allow a child under 13 to use the
 * group chats.
 *
 * Deliberately readable without an account. A parent has no reason to have a
 * login here, and making them create one to answer a question about their own
 * child would mean most of them never finish — which would leave the student
 * locked out of the thing they signed up for.
 *
 * It tells them what is actually collected and who can see it, in plain words,
 * before asking for anything. Consent that is given without reading what it
 * covers isn't worth recording.
 */
export function ConsentPage() {
  const [params] = useSearchParams();
  const token = (params.get('token') ?? '').trim();

  const [info, setInfo] = useState<{ studentName: string; orgName: string; alreadyGranted: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [parentName, setParentName] = useState('');
  const [relation, setRelation] = useState('Parent');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = getSupabase();
      if (!s || !token) { setLoading(false); return; }
      const { data } = await s.rpc('consent_request_info', { p_token: token });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setInfo({
          studentName: row.student_name,
          orgName: row.org_name,
          alreadyGranted: Boolean(row.already_granted),
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const s = getSupabase();
      if (!s) throw new Error('Not configured.');
      const { error: err } = await s.rpc('grant_student_consent', {
        p_token: token, p_parent_name: parentName, p_relation: relation,
      });
      if (err) throw new Error(err.message);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-lg border border-gray-300 px-3 py-3 text-base';

  if (loading) return <Shell><p className="text-center text-gray-500">Loading…</p></Shell>;

  if (!token || !info) {
    return (
      <Shell>
        <p className="text-center text-gray-600">
          This permission link isn&rsquo;t valid, or it has already been used. Ask your child&rsquo;s
          youth leader to send a new one.
        </p>
      </Shell>
    );
  }

  if (done || info.alreadyGranted) {
    return (
      <Shell>
        <h1 className="mb-2 text-center text-2xl font-bold">Thank you</h1>
        <p className="text-center text-sm text-gray-600">
          {info.studentName} can now be added to {info.orgName} group chats by their leader.
        </p>
        <p className="mt-4 text-center text-xs text-gray-500">
          You can change your mind at any time — ask a leader at {info.orgName} and they&rsquo;ll
          remove {info.studentName.split(' ')[0]} from the chats and delete their account if you want.
        </p>
        <p className="mt-6 text-center">
          <Link to="/privacy" className="text-xs text-gray-400 underline">Read the privacy policy</Link>
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="mb-1 text-center text-2xl font-bold">Permission for {info.studentName.split(' ')[0]}</h1>
      <p className="mb-5 text-center text-sm text-gray-500">{info.orgName}</p>

      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--th-hairline, #e5e7eb)' }}>
        <p>
          <strong>{info.studentName}</strong> has signed up for the {info.orgName} app and is under 13,
          so we need a parent or guardian to say it&rsquo;s okay before they can join any group chats.
        </p>

        <p className="mt-3 font-semibold">What we hold about them</p>
        <ul className="mt-1 list-disc pl-5 text-gray-700">
          <li>Their name, birthday, graduation year, and phone number</li>
          <li>Your name and phone number, so a leader can reach you</li>
          <li>Anything they post in a group chat — messages, photos, voice messages</li>
        </ul>

        <p className="mt-3 font-semibold">Who can see it</p>
        <ul className="mt-1 list-disc pl-5 text-gray-700">
          <li>The youth pastor and coaches at {info.orgName}</li>
          <li>Leaders of the specific groups your child is put in</li>
          <li>Other students only in the group chats they share</li>
        </ul>
        <p className="mt-2 text-gray-700">
          We don&rsquo;t sell it, don&rsquo;t use it for advertising, and don&rsquo;t share it outside {info.orgName}.
        </p>

        <p className="mt-3 font-semibold">You stay in control</p>
        <p className="mt-1 text-gray-700">
          You can ask a leader at any time to show you everything we hold about your child,
          correct it, take back this permission, or delete their account completely.
          Taking back permission removes them from every group chat straight away.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <label className="text-sm font-medium">
          Your full name
          <input
            className={`mt-1 ${field}`}
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="First and last"
            autoComplete="name"
            required
          />
        </label>
        <label className="text-sm font-medium">
          You are their…
          <select className={`mt-1 ${field}`} value={relation} onChange={(e) => setRelation(e.target.value)}>
            <option>Parent</option>
            <option>Guardian</option>
            <option>Grandparent</option>
            <option>Other family member</option>
          </select>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={parentName.trim().length < 2 || busy}
          className="mt-1 w-full rounded-full px-6 py-3 text-base font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--th-primary, #0f1420)', color: 'var(--th-primary-text, #fff)' }}
        >
          {busy ? 'Saving…' : `I give permission for ${info.studentName.split(' ')[0]}`}
        </button>
        <p className="text-center text-xs text-gray-500">
          We record your name and today&rsquo;s date so the ministry has a record of this.
        </p>
        <p className="text-center">
          <Link to="/privacy" className="text-xs text-gray-400 underline">Privacy policy</Link>
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <div className="mb-6 flex flex-col items-center gap-2">
        <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-2xl" />
        <p className="text-base font-bold">Switch Leader App</p>
      </div>
      {children}
    </div>
  );
}
