import { useMemo, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import {
  useDeleteFormSubmission,
  useFormSubmissionCount,
  useFormSubmissions,
  useHasSubmittedForm,
  useSubmitForm,
  type FormAnswer,
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
        {showResponses && <ResponsesModal orgId={org.id} blockId={ctx.blockId} title={props.title} onClose={() => setShowResponses(false)} />}
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
        <ResponsesModal orgId={org.id} blockId={ctx.blockId} title={props.title} onClose={() => setShowResponses(false)} />
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

/** Owner/admin panel listing every response this form has collected. */
function ResponsesModal({ orgId, blockId, title, onClose }: { orgId: string; blockId: string; title: string; onClose: () => void }) {
  const { data: subs = [], isLoading } = useFormSubmissions(orgId, blockId, true);
  const del = useDeleteFormSubmission(orgId, blockId);
  const csvHref = useMemo(() => buildCsv(subs), [subs]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>{title} — responses ({subs.length})</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full px-2 text-2xl leading-none text-gray-400 hover:bg-black/5">×</button>
        </div>

        {subs.length > 0 && (
          <a href={csvHref} download={`${title || 'form'}-responses.csv`} className="mt-1 text-sm underline" style={{ color: 'var(--th-text)' }}>
            Download all as spreadsheet (CSV)
          </a>
        )}

        <div className="mt-3 flex-1 overflow-y-auto">
          {isLoading && <p className="text-sm text-gray-500">Loading responses…</p>}
          {!isLoading && subs.length === 0 && <p className="text-sm text-gray-500">No responses yet.</p>}
          <ul className="flex flex-col gap-3">
            {subs.map((s) => (
              <li key={s.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--th-hairline)' }}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-500">
                    {new Date(s.createdAt).toLocaleString()}{s.submitterEmail ? ` · ${s.submitterEmail}` : ''}
                  </span>
                  <button type="button" onClick={() => { if (window.confirm('Delete this response?')) del.mutate(s.id); }} className="text-xs text-red-600 underline">Delete</button>
                </div>
                <dl className="flex flex-col gap-1">
                  {s.data.map((a, i) => (
                    <div key={i} className="text-sm">
                      <dt className="font-medium" style={{ color: 'var(--th-heading)' }}>{a.label}</dt>
                      <dd style={{ color: 'var(--th-text)' }}>{a.value || <span className="text-gray-400">—</span>}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Build a downloadable CSV data URL from the responses (labels as columns). */
function buildCsv(subs: { data: FormAnswer[]; submitterEmail: string | null; createdAt: string }[]): string {
  const labels: string[] = [];
  subs.forEach((s) => s.data.forEach((a) => { if (!labels.includes(a.label)) labels.push(a.label); }));
  const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Submitted', 'Email', ...labels].map(esc).join(',');
  const rows = subs.map((s) => {
    const map = new Map(s.data.map((a) => [a.label, a.value]));
    return [s.createdAt, s.submitterEmail ?? '', ...labels.map((l) => map.get(l) ?? '')].map(esc).join(',');
  });
  const csv = [header, ...rows].join('\r\n');
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}
