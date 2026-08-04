import { useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import {
  useDeleteFormSubmission,
  useFormSubmissionCount,
  useFormSubmissions,
  useHasSubmittedForm,
  useSubmitForm,
  type FormAnswer,
  type FormSubmission,
} from '@/data/formHooks';
import { useOrganization } from '@/data/hooks';
import { errorMessage } from '@/lib/errors';
import type { FormField, FormProps } from '../blockProps';
import type { ViewerCtx } from '../actions';

const inputCls = 'w-full rounded-lg border px-3 py-2.5 text-base focus:outline-none focus-visible:ring-2';
const hairline = { borderColor: 'var(--th-hairline-strong)' };

/** Split a field's comma/newline-separated option string into clean choices. */
function optionsOf(field: FormField): string[] {
  return (field.options ?? '')
    .split(/[,\n]/)
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * The Form block: collects input from an app's viewers. Anyone who can view the
 * app can submit; the submitted data is stored per-form and readable only by
 * owners/admins (via the "View responses" panel below the form when managing).
 */
export function FormView({ props, ctx }: { props: FormProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { user } = useAuth();
  const { role } = useMembershipRole(org?.id);
  const isAdmin = role === 'owner' || role === 'admin';
  const once = Boolean(props.oncePerUser);
  const localKey = `th-form-done-${ctx.blockId ?? ''}`;

  const fields = props.fields ?? [];
  const [values, setValues] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false); // non-once success (allows another)
  const [localDone, setLocalDone] = useState(() => {
    try { return once && localStorage.getItem(localKey) === '1'; } catch { return false; }
  });
  const [showResponses, setShowResponses] = useState(false);
  const submit = useSubmitForm();
  const { data: count = 0 } = useFormSubmissionCount(org?.id, ctx.blockId, isAdmin);
  // For signed-in people on a once-per-user form, check the server so the form
  // stays hidden even on another device / after clearing local storage.
  const { data: serverSubmitted = false } = useHasSubmittedForm(org?.id, ctx.blockId, once && Boolean(user));
  const alreadySubmitted = once && (localDone || serverSubmitted);

  const set = (i: number, v: string) => setValues((prev) => ({ ...prev, [i]: v }));

  function markOnceDone() {
    setLocalDone(true);
    try { localStorage.setItem(localKey, '1'); } catch { /* ignore */ }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Validate required fields.
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const v = (values[i] ?? '').trim();
      if (f.required && !v) {
        setError(`Please fill out “${f.label}”.`);
        return;
      }
      if (v && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        setError(`“${f.label}” needs to be a valid email address.`);
        return;
      }
    }
    if (!org || !ctx.blockId) { setError('This form isn’t ready yet.'); return; }

    const data: FormAnswer[] = fields.map((f, i) => ({
      label: f.label,
      value: f.type === 'checkbox' ? ((values[i] === 'Yes') ? 'Yes' : 'No') : (values[i] ?? '').trim(),
    }));

    try {
      await submit.mutateAsync({ orgId: org.id, blockId: ctx.blockId, pageSlug: undefined, title: props.title, data, once });
      if (once) markOnceDone();
      else { setDone(true); setValues({}); }
    } catch (err) {
      const msg = errorMessage(err);
      // Server rejected a second submission — treat as already-done, not an error.
      if (/already submitted/i.test(msg)) { markOnceDone(); return; }
      setError(msg);
    }
  }

  // Once-per-user and already submitted: the form vanishes completely for the
  // person who submitted — as if it were never on the page. Owners/admins keep
  // a small, quiet link so they can still open what's been collected.
  if (alreadySubmitted) {
    if (!isAdmin || !org || !ctx.blockId) return <></>;
    return (
      <div className="rounded-xl border p-5" style={hairline}>
        <h3 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>{props.title}</h3>
        <p className="mt-1 text-sm text-gray-500">Hidden from people who’ve already submitted. Only you (owners &amp; admins) see this.</p>
        <button
          type="button"
          onClick={() => setShowResponses(true)}
          className="mt-3 rounded-full px-6 py-3 font-semibold"
          style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
        >
          View responses ({count})
        </button>
        {showResponses && <ResponsesView orgId={org.id} blockId={ctx.blockId} title={props.title} fields={fields} onClose={() => setShowResponses(false)} />}
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-5" style={hairline}>
      <h3 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>{props.title}</h3>
      {props.description && <p className="mt-1 text-sm text-gray-500">{props.description}</p>}

      {done ? (
        <div className="mt-4 rounded-lg border p-4 text-center" style={hairline}>
          <p className="font-medium" style={{ color: 'var(--th-heading)' }}>{props.successMessage || 'Thanks — your response was submitted!'}</p>
          <button type="button" onClick={() => setDone(false)} className="mt-3 text-sm underline" style={{ color: 'var(--th-text)' }}>
            Submit another response
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          {fields.map((f, i) => (
            <FieldInput key={i} field={f} value={values[i] ?? ''} onChange={(v) => set(i, v)} />
          ))}
          {fields.length === 0 && <p className="text-sm text-gray-500">This form has no fields yet.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submit.isPending || fields.length === 0}
            className="mt-1 rounded-full px-6 py-3 font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
          >
            {submit.isPending ? 'Submitting…' : (props.submitLabel || 'Submit')}
          </button>
        </form>
      )}

      {isAdmin && ctx.blockId && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--th-hairline)' }}>
          <button type="button" onClick={() => setShowResponses(true)} className="text-sm font-semibold underline" style={{ color: 'var(--th-text)' }}>
            View responses ({count})
          </button>
        </div>
      )}

      {showResponses && org && ctx.blockId && (
        <ResponsesView orgId={org.id} blockId={ctx.blockId} title={props.title} fields={fields} onClose={() => setShowResponses(false)} />
      )}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  const label = (
    <span className="mb-1 block text-sm font-medium" style={{ color: 'var(--th-text)' }}>
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </span>
  );

  if (field.type === 'long') {
    return (
      <label className="block">
        {label}
        <textarea className={inputCls} style={hairline} rows={4} placeholder={field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (field.type === 'dropdown') {
    return (
      <label className="block">
        {label}
        <select className={inputCls} style={hairline} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {optionsOf(field).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={value === 'Yes'} onChange={(e) => onChange(e.target.checked ? 'Yes' : '')} />
        <span className="text-sm" style={{ color: 'var(--th-text)' }}>
          {field.label}{field.required && <span className="text-red-500"> *</span>}
        </span>
      </label>
    );
  }
  const htmlType = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text';
  return (
    <label className="block">
      {label}
      <input type={htmlType} className={inputCls} style={hairline} placeholder={field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * Full-screen owner/admin view of a form's responses. A "Summary" tab tallies
 * every dropdown/checkbox question into a bar graph; a "Responses" tab lists
 * each submission in full. Export downloads a real CSV (Blob) with a Copy
 * fallback for platforms that block downloads (iOS / installed PWAs).
 */
function ResponsesView({ orgId, blockId, title, fields, onClose }: { orgId: string; blockId: string; title: string; fields: FormField[]; onClose: () => void }) {
  const { data: subs = [], isLoading } = useFormSubmissions(orgId, blockId, true);
  const del = useDeleteFormSubmission(orgId, blockId);
  const [tab, setTab] = useState<'summary' | 'responses'>('summary');
  const [copied, setCopied] = useState(false);

  const chartFields = fields.filter((f) => f.type === 'dropdown' || f.type === 'checkbox');

  function exportCsv() {
    const blob = new Blob(['﻿' + buildCsv(subs)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'form').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'form'}-responses.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function copyCsv() {
    try {
      await navigator.clipboard.writeText(buildCsv(subs));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the Export button still works */ }
  }

  const pillActive = { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' };
  const pillIdle = { border: '1px solid var(--th-hairline-strong)' } as const;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true">
      <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--th-hairline)', paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full px-2 text-2xl leading-none text-gray-500 hover:bg-black/5">×</button>
        <h3 className="min-w-0 flex-1 truncate text-lg font-bold" style={{ color: 'var(--th-heading)' }}>{title}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--th-hairline)' }}>
        <button type="button" onClick={() => setTab('summary')} className="rounded-full px-4 py-1.5 text-sm font-semibold" style={tab === 'summary' ? pillActive : pillIdle}>Summary</button>
        <button type="button" onClick={() => setTab('responses')} className="rounded-full px-4 py-1.5 text-sm font-semibold" style={tab === 'responses' ? pillActive : pillIdle}>Responses ({subs.length})</button>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => void copyCsv()} disabled={subs.length === 0} className="rounded-full px-3 py-1.5 text-sm font-medium disabled:opacity-40" style={pillIdle}>{copied ? 'Copied!' : 'Copy'}</button>
          <button type="button" onClick={exportCsv} disabled={subs.length === 0} className="rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-40" style={pillActive}>Export CSV</button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
        {isLoading && <p className="text-sm text-gray-500">Loading responses…</p>}
        {!isLoading && subs.length === 0 && <p className="text-sm text-gray-500">No responses yet.</p>}

        {!isLoading && subs.length > 0 && tab === 'summary' && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-gray-500">{subs.length} response{subs.length === 1 ? '' : 's'} total.</p>
            {chartFields.length === 0
              ? <p className="text-sm text-gray-500">No dropdown or checkbox questions to chart. Switch to “Responses” to read every submission.</p>
              : chartFields.map((f, i) => <ChoiceSummary key={i} field={f} subs={subs} />)}
          </div>
        )}

        {!isLoading && subs.length > 0 && tab === 'responses' && (
          <ul className="flex flex-col gap-3">
            {subs.map((s) => (
              <li key={s.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--th-hairline)' }}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">{new Date(s.createdAt).toLocaleString()}{(s.submitterName || s.submitterEmail) ? ` · ${s.submitterName || s.submitterEmail}` : ''}</span>
                  <button type="button" onClick={() => { if (window.confirm('Delete this response?')) del.mutate(s.id); }} className="text-xs text-red-600 underline">Delete</button>
                </div>
                <dl className="flex flex-col gap-2">
                  {s.data.map((a, i) => (
                    <div key={i} className="text-sm">
                      <dt className="font-medium" style={{ color: 'var(--th-heading)' }}>{a.label}</dt>
                      <dd className="whitespace-pre-wrap break-words" style={{ color: 'var(--th-text)' }}>{a.value || <span className="text-gray-400">—</span>}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A bar-graph tally of one dropdown/checkbox question's answers. */
function ChoiceSummary({ field, subs }: { field: FormField; subs: FormSubmission[] }) {
  const answers = subs.map((s) => (s.data.find((a) => a.label === field.label)?.value ?? '').trim());
  let rows: { label: string; count: number }[];
  if (field.type === 'checkbox') {
    rows = [
      { label: 'Yes', count: answers.filter((v) => v === 'Yes').length },
      { label: 'No', count: answers.filter((v) => v !== 'Yes').length },
    ];
  } else {
    const counts = new Map<string, number>();
    optionsOf(field).forEach((o) => counts.set(o, 0));
    answers.forEach((v) => { if (v) counts.set(v, (counts.get(v) ?? 0) + 1); });
    rows = [...counts.entries()].map(([label, count]) => ({ label, count }));
  }
  const total = rows.reduce((n, r) => n + r.count, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--th-hairline)' }}>
      <p className="mb-3 font-semibold" style={{ color: 'var(--th-heading)' }}>{field.label}</p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => {
          const pct = Math.round((r.count / total) * 100);
          return (
            <div key={i}>
              <div className="mb-0.5 flex items-center justify-between text-sm">
                <span style={{ color: 'var(--th-text)' }}>{r.label}</span>
                <span className="tabular-nums text-gray-500">{r.count} · {pct}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--th-hairline)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round((r.count / max) * 100)}%`, backgroundColor: 'var(--th-primary)', minWidth: r.count ? '0.5rem' : 0 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Build a CSV string from the responses (question labels as columns). */
function buildCsv(subs: { data: FormAnswer[]; submitterName: string | null; submitterEmail: string | null; createdAt: string }[]): string {
  const labels: string[] = [];
  subs.forEach((s) => s.data.forEach((a) => { if (!labels.includes(a.label)) labels.push(a.label); }));
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Submitted', 'Name', 'Email', ...labels].map(esc).join(',');
  const rows = subs.map((s) => {
    const map = new Map(s.data.map((a) => [a.label, a.value]));
    return [new Date(s.createdAt).toLocaleString(), s.submitterName ?? '', s.submitterEmail ?? '', ...labels.map((l) => map.get(l) ?? '')].map(esc).join(',');
  });
  return [header, ...rows].join('\r\n');
}
