import { useState } from 'react';

import { sanitizeHtml } from '../sanitize';
import type {
  AccordionProps,
  Align,
  DividerProps,
  HeadingProps,
  ParagraphProps,
  SpacerProps,
} from '../blockProps';

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

export function ParagraphView({ props }: { props: ParagraphProps }) {
  return (
    <div
      className={`leading-relaxed ${alignClass(props.align)} [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6`}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(props.html) }}
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

export function AccordionView({ props }: { props: AccordionProps }) {
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
        <div
          className="px-4 pb-4 leading-relaxed [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(props.html) }}
        />
      )}
    </div>
  );
}
