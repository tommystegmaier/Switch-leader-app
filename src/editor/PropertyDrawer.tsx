import { useState } from 'react';

import { usePublishedPages } from '@/data/hooks';
import type { BlockAction } from '@/blocks/actions';
import type { FieldDef } from '@/blocks/fields';
import { getBlockDef } from '@/blocks/registry';
import type { Block } from '@/types';
import { MediaPicker } from './MediaPicker';
import { RichTextEditor } from './RichTextEditor';

/**
 * Right-side property drawer. Renders the editor inputs for a block from its
 * registry `fields` list — generic and data-driven, so most blocks need no
 * bespoke editor UI. Text-like inputs autosave on blur; discrete controls
 * (toggles, selects, lists) save immediately.
 */
export function PropertyDrawer({
  block,
  onCommit,
  onClose,
}: {
  block: Block;
  onCommit: (props: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const def = getBlockDef(block.type);
  const [draft, setDraft] = useState<Record<string, unknown>>({ ...block.props });

  if (!def) return null;

  const setField = (key: string, value: unknown, commit = false) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (commit) onCommit(next);
      return next;
    });
  };
  const commitAll = () => onCommit(draft);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`Edit ${def.label}`}>
      <div className="absolute inset-0 bg-black/30" onClick={() => { commitAll(); onClose(); }} />
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-lg font-bold">{def.icon} {def.label}</h2>
          <button type="button" onClick={() => { commitAll(); onClose(); }} className="rounded-full px-3 py-1 text-sm font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Done</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {def.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={draft[field.key]}
                orgId={block.orgId}
                onChange={(v, commit) => setField(field.key, v, commit)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ field, children }: { field: FieldDef; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{field.label}</span>
      {children}
      {field.help && <span className="text-xs text-gray-500">{field.help}</span>}
    </label>
  );
}

const inputCls = 'rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2';

function FieldInput({
  field,
  value,
  orgId,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  orgId: string;
  onChange: (value: unknown, commit?: boolean) => void;
}) {
  switch (field.type) {
    case 'image':
    case 'pdf':
      return <MediaField field={field} value={value} orgId={orgId} onChange={onChange} />;
    case 'text':
    case 'url':
      return (
        <Label field={field}>
          <input
            type="text"
            className={inputCls}
            placeholder={field.placeholder ?? ''}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onChange(value ?? '', true)}
          />
        </Label>
      );
    case 'textarea':
      return (
        <Label field={field}>
          <textarea className={inputCls} rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} onBlur={() => onChange(value ?? '', true)} />
        </Label>
      );
    case 'richtext':
      return (
        <Label field={field}>
          <RichTextEditor value={String(value ?? '')} onChange={(html) => onChange(html, true)} />
        </Label>
      );
    case 'number':
      return (
        <Label field={field}>
          <input type="number" className={inputCls} min={field.min} max={field.max} step={field.step ?? 1} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} onBlur={() => onChange(Number(value ?? 0), true)} />
        </Label>
      );
    case 'color':
      return (
        <Label field={field}>
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 cursor-pointer rounded border border-gray-300 p-0.5" value={String(value || '#000000')} onChange={(e) => onChange(e.target.value, true)} />
            <input type="text" className={`${inputCls} flex-1`} value={String(value ?? '')} placeholder="#000000 or empty for theme" onChange={(e) => onChange(e.target.value)} onBlur={() => onChange(value ?? '', true)} />
          </div>
        </Label>
      );
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked, true)} className="h-4 w-4" />
          <span className="font-medium">{field.label}</span>
        </label>
      );
    case 'select':
      return (
        <Label field={field}>
          <select className={inputCls} value={String(value ?? field.options?.[0]?.value ?? '')} onChange={(e) => {
            const raw = e.target.value;
            // Coerce numeric-looking option values back to numbers for props like level/columns.
            const coerced = /^\d+$/.test(raw) ? Number(raw) : raw;
            onChange(coerced, true);
          }}>
            {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Label>
      );
    case 'date':
      return (
        <Label field={field}>
          <input type="datetime-local" className={inputCls} value={toLocalInput(String(value ?? ''))} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : '', true)} />
        </Label>
      );
    case 'action':
      return <ActionInput field={field} value={value as BlockAction | undefined} orgId={orgId} onChange={(v) => onChange(v, true)} />;
    case 'items':
      return <ItemsInput field={field} value={(value as Record<string, unknown>[]) ?? []} orgId={orgId} onChange={(v) => onChange(v, true)} />;
    default:
      return null;
  }
}

/** Image/PDF field: paste a URL or upload / pick from the media library. */
function MediaField({
  field,
  value,
  orgId,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  orgId: string;
  onChange: (value: unknown, commit?: boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const url = String(value ?? '');
  const isPdf = field.type === 'pdf';
  return (
    <Label field={field}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          className={`${inputCls} flex-1`}
          placeholder={isPdf ? 'PDF URL, or upload →' : 'Image URL, or upload →'}
          value={url}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(url, true)}
        />
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-black/5"
        >
          {isPdf ? 'Upload PDF' : 'Upload'}
        </button>
      </div>
      {url && !isPdf && (
        <img src={url} alt="" className="mt-2 max-h-32 rounded-md border" style={{ borderColor: 'rgba(0,0,0,0.12)' }} />
      )}
      {url && isPdf && <span className="mt-1 text-xs text-gray-500">📄 PDF attached</span>}
      {picking && (
        <MediaPicker
          orgId={orgId}
          accept={isPdf ? 'application/pdf' : 'image/*'}
          onSelect={(u) => onChange(u, true)}
          onClose={() => setPicking(false)}
        />
      )}
    </Label>
  );
}

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ActionInput({
  field,
  value,
  orgId,
  onChange,
}: {
  field: FieldDef;
  value: BlockAction | undefined;
  orgId: string;
  onChange: (v: BlockAction) => void;
}) {
  const action: BlockAction = value ?? { type: 'url', target: '' };
  const { data: pages } = usePublishedPages(orgId);
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <span className="text-sm font-medium">{field.label}</span>
      {field.help && <p className="mb-2 text-xs text-gray-500">{field.help}</p>}
      <div className="mt-1 flex flex-col gap-2">
        <select className={inputCls} value={action.type} onChange={(e) => onChange({ type: e.target.value as BlockAction['type'], target: '' })}>
          <option value="url">Open a link (URL)</option>
          <option value="page">Go to a page</option>
          <option value="email">Send an email</option>
          <option value="phone">Call a phone number</option>
        </select>
        {action.type === 'page' ? (
          <select className={inputCls} value={action.target} onChange={(e) => onChange({ ...action, target: e.target.value })}>
            <option value="">— choose a page —</option>
            {(pages ?? []).map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
          </select>
        ) : (
          <input
            type="text"
            className={inputCls}
            placeholder={action.type === 'url' ? 'https://…' : action.type === 'email' ? 'name@example.com' : '+1 555 123 4567'}
            value={action.target}
            onChange={(e) => onChange({ ...action, target: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}

function ItemsInput({
  field,
  value,
  orgId,
  onChange,
}: {
  field: FieldDef;
  value: Record<string, unknown>[];
  orgId: string;
  onChange: (v: Record<string, unknown>[]) => void;
}) {
  const items = value ?? [];
  const update = (i: number, key: string, v: unknown) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, [key]: v } : it));
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <span className="text-sm font-medium">{field.label}</span>
      <div className="mt-2 flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-md bg-black/5 p-2">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
              <span>#{i + 1}</span>
              <div className="flex gap-1">
                <button type="button" className="rounded px-2 hover:bg-black/10" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className="rounded px-2 hover:bg-black/10" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                <button type="button" className="rounded px-2 text-red-600 hover:bg-black/10" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label="Remove">🗑</button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {(field.itemFields ?? []).map((sub) => (
                <FieldInput
                  key={sub.key}
                  field={sub}
                  value={item[sub.key]}
                  orgId={orgId}
                  onChange={(v) => update(i, sub.key, v)}
                />
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="rounded-md border border-dashed border-gray-300 py-2 text-sm hover:bg-black/5"
          onClick={() => onChange([...items, { ...(field.itemDefault ?? {}) }])}
        >
          + Add {field.label.replace(/s$/, '').toLowerCase()}
        </button>
      </div>
    </div>
  );
}
