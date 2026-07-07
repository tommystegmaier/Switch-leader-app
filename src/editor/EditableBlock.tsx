import { useState, type HTMLAttributes } from 'react';

import { BlockView, blockWidth, type BlockWidth } from '@/blocks/BlockView';
import type { ViewerCtx } from '@/blocks/actions';
import { sanitizeHtml } from '@/blocks/sanitize';
import type { Block } from '@/types';
import type { HeadingProps, ParagraphProps } from '@/blocks/blockProps';

const WIDTH_CYCLE: Record<BlockWidth, BlockWidth> = { full: 'half', half: 'third', third: 'full' };
const WIDTH_LABEL: Record<BlockWidth, string> = { full: 'Full', half: '½', third: '⅓' };

/**
 * Wraps a block in Edit Mode with:
 *  - a hover/long-press toolbar: ⚙ edit, ⧉ duplicate, ↑/↓ move, ⠿ drag, 🗑 delete
 *  - inline editing for heading & paragraph (click and type; autosave on blur)
 *
 * Every other block opens the property drawer via ⚙. Inline edits and toolbar
 * actions are written through RLS-guarded mutations.
 */
export function EditableBlock({
  block,
  ctx,
  onEdit,
  onDuplicate,
  onDelete,
  onMove,
  onInsertAfter,
  onInlineChange,
  dragHandleProps,
  isFirst,
  isLast,
}: {
  block: Block;
  ctx: ViewerCtx;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onInsertAfter: () => void;
  onInlineChange: (props: Record<string, unknown>) => void;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [hover, setHover] = useState(false);
  const width = blockWidth(block);

  return (
    <div
      className="group relative h-full rounded-lg ring-offset-2 transition-shadow hover:ring-2 hover:ring-black/10"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Toolbar */}
      <div className={`absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-full border bg-white px-1 py-0.5 text-sm shadow-sm transition-opacity ${hover ? 'opacity-100' : 'opacity-0'} group-focus-within:opacity-100`}>
        <button type="button" {...dragHandleProps} className="cursor-grab rounded px-1.5 py-1 hover:bg-black/10" aria-label="Drag to reorder" title="Drag">⠿</button>
        <button type="button" onClick={() => onMove(-1)} disabled={isFirst} className="rounded px-1.5 py-1 hover:bg-black/10 disabled:opacity-30" aria-label="Move up">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={isLast} className="rounded px-1.5 py-1 hover:bg-black/10 disabled:opacity-30" aria-label="Move down">↓</button>
        <button
          type="button"
          onClick={() => onInlineChange({ ...block.props, __width: WIDTH_CYCLE[width] })}
          className="rounded px-1.5 py-1 hover:bg-black/10"
          aria-label="Change width"
          title={`Width: ${WIDTH_LABEL[width]} (tap to change — put blocks side by side)`}
        >
          {WIDTH_LABEL[width]}
        </button>
        <button type="button" onClick={onEdit} className="rounded px-1.5 py-1 hover:bg-black/10" aria-label="Edit properties" title="Edit">⚙</button>
        <button type="button" onClick={onDuplicate} className="rounded px-1.5 py-1 hover:bg-black/10" aria-label="Duplicate" title="Duplicate">⧉</button>
        <button type="button" onClick={onInsertAfter} className="rounded px-1.5 py-1 hover:bg-black/10" aria-label="Insert block after" title="Insert block after">＋</button>
        <button type="button" onClick={onDelete} className="rounded px-1.5 py-1 text-red-600 hover:bg-black/10" aria-label="Delete" title="Delete">🗑</button>
      </div>

      <div className="h-full p-1">
        {block.type === 'heading' ? (
          <InlineHeading props={block.props as unknown as HeadingProps} onSave={(text) => onInlineChange({ ...block.props, text })} />
        ) : block.type === 'paragraph' ? (
          <InlineParagraph props={block.props as unknown as ParagraphProps} onSave={(html) => onInlineChange({ ...block.props, html })} />
        ) : (
          <BlockView block={block} ctx={ctx} />
        )}
      </div>
    </div>
  );
}

/** Inline-editable heading: matches HeadingView styling but you can type in it. */
function InlineHeading({ props, onSave }: { props: HeadingProps; onSave: (text: string) => void }) {
  const Tag = (props.level === 1 ? 'h1' : props.level === 2 ? 'h2' : 'h3') as 'h1';
  const cls = `font-bold outline-none ${props.align === 'center' ? 'text-center' : props.align === 'right' ? 'text-right' : 'text-left'} ${props.underline ? 'underline underline-offset-4' : ''} ${props.level === 1 ? 'text-3xl' : props.level === 2 ? 'text-2xl' : 'text-xl'}`;
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      className={cls}
      style={{ color: props.color || 'var(--th-heading)' }}
      onBlur={(e) => {
        const text = e.currentTarget.textContent ?? '';
        if (text !== props.text) onSave(text);
      }}
    >
      {props.text}
    </Tag>
  );
}

/** Inline-editable paragraph: type directly; formatting via the ⚙ drawer. */
function InlineParagraph({ props, onSave }: { props: ParagraphProps; onSave: (html: string) => void }) {
  const cls = `leading-relaxed outline-none ${props.align === 'center' ? 'text-center' : props.align === 'right' ? 'text-right' : 'text-left'} [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6`;
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      className={cls}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(props.html) }}
      onBlur={(e) => {
        const html = sanitizeHtml(e.currentTarget.innerHTML);
        if (html !== props.html) onSave(html);
      }}
    />
  );
}
