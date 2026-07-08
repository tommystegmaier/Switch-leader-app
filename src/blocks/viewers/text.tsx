import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import { getSupabase } from '@/lib/supabase';
import type { ViewerCtx } from '../actions';
import { sanitizeHtml } from '../sanitize';
import type {
  AccordionProps,
  Align,
  DividerProps,
  HeadingProps,
  ParagraphProps,
  SpacerProps,
} from '../blockProps';

/** Render styles for creator rich-text (matches the editor): lists, headings,
 *  quotes, checklists (read-only), divider, highlight. */
const RICHTEXT_CLS =
  '[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6' +
  ' [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold' +
  ' [&_blockquote]:border-l-4 [&_blockquote]:border-black/20 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600' +
  ' [&_[data-type=taskList]]:list-none [&_[data-type=taskList]]:pl-0' +
  ' [&_[data-type=taskItem]]:flex [&_[data-type=taskItem]]:items-start [&_[data-type=taskItem]]:gap-2' +
  ' [&_input]:mt-1 [&_input]:pointer-events-none [&_hr]:my-3 [&_hr]:border-black/20 [&_mark]:rounded [&_mark]:px-0.5';

function alignClass(align: Align): string {
  return align === 'center'
    ? 'text-center'
    : align === 'right'
      ? 'text-right'
      : 'text-left';
}

export function HeadingView({ props }: { props: HeadingProps }) {
  const cls = `font-bold ${alignClass(props.align)} ${
    props.underline ? 'underline underline-offset-4' : ''
  } ${props.level === 1 ? 'text-3xl' : props.level === 2 ? 'text-2xl' : 'text-xl'}`;
  const style = { color: props.color || 'var(--th-heading)' };
  if (props.level === 1) return <h1 className={cls} style={style}>{props.text}</h1>;
  if (props.level === 2) return <h2 className={cls} style={style}>{props.text}</h2>;
  return <h3 className={cls} style={style}>{props.text}</h3>;
}

export function ParagraphView({ props, ctx }: { props: ParagraphProps; ctx: ViewerCtx }) {
  return <RichContent html={props.html} ctx={ctx} className={`leading-relaxed ${alignClass(props.align)} ${RICHTEXT_CLS}`} />;
}

/**
 * Renders sanitized rich-text. If the viewer is a manager (owner/admin/editor)
 * and this is the live view, checklist items become tappable — a tap flips the
 * checkbox for EVERYONE (persisted to the block + published snapshot).
 */
function RichContent({ html, ctx, className }: { html: string; ctx: ViewerCtx; className?: string }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { canEdit } = useMembershipRole(org?.id);
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [localHtml, setLocalHtml] = useState<string | null>(null);
  useEffect(() => { setLocalHtml(null); }, [html]);
  const shown = localHtml ?? html;
  const interactive = canEdit && !ctx.editing && Boolean(ctx.blockId);

  const toggle = useMutation({
    mutationFn: async (newHtml: string) => {
      const s = getSupabase();
      if (!s || !ctx.blockId) return;
      const { error } = await s.rpc('toggle_checklist', { p_block: ctx.blockId, p_html: newHtml });
      if (error) throw error;
    },
    onSuccess: () => { if (org) qc.invalidateQueries({ queryKey: ['org', org.id, 'page'] }); },
  });

  function onClick(e: MouseEvent<HTMLDivElement>) {
    if (!interactive || !ref.current) return;
    const li = (e.target as HTMLElement).closest('[data-type="taskItem"]');
    if (!li) return;
    const items = Array.from(ref.current.querySelectorAll('[data-type="taskItem"]'));
    const idx = items.indexOf(li as HTMLElement);
    if (idx < 0) return;
    e.preventDefault();
    const doc = new DOMParser().parseFromString(shown, 'text/html');
    const dItems = doc.querySelectorAll('[data-type="taskItem"]');
    const it = dItems[idx] as HTMLElement | undefined;
    if (!it) return;
    const nowChecked = it.getAttribute('data-checked') === 'true';
    it.setAttribute('data-checked', nowChecked ? 'false' : 'true');
    const input = it.querySelector('input');
    if (input) { if (nowChecked) input.removeAttribute('checked'); else input.setAttribute('checked', 'checked'); }
    const next = sanitizeHtml(doc.body.innerHTML);
    setLocalHtml(next);
    toggle.mutate(next);
  }

  return (
    <div
      ref={ref}
      onClick={interactive ? onClick : undefined}
      className={`${className ?? ''} ${interactive ? '[&_[data-type=taskItem]]:cursor-pointer' : ''}`}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(shown) }}
    />
  );
}

export function DividerView({ props }: { props: DividerProps }) {
  return (
    <hr
      style={{
        borderColor: props.color || 'var(--th-text)',
        borderTopWidth: props.thickness,
        marginTop: props.margin,
        marginBottom: props.margin,
      }}
    />
  );
}

export function SpacerView({ props }: { props: SpacerProps }) {
  return <div style={{ height: props.height }} aria-hidden />;
}

export function AccordionView({ props, ctx }: { props: AccordionProps; ctx: ViewerCtx }) {
  const [open, setOpen] = useState(props.openByDefault);
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold"
        style={{ color: 'var(--th-heading)' }}
      >
        <span>{props.title}</span>
        <span aria-hidden className="ml-2">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <RichContent html={props.html} ctx={ctx} className={`px-4 pb-4 leading-relaxed ${RICHTEXT_CLS}`} />
      )}
    </div>
  );
}
