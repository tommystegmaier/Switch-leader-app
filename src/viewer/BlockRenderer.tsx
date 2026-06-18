import { useNavigate } from 'react-router-dom';

import type { Block } from '@/types';

/**
 * Phase 1 block renderer — a minimal, GENERIC renderer for a handful of block
 * types so the Viewer shell shows real content.
 *
 * This is intentionally a placeholder. In Phase 3 this file is replaced by the
 * extensible block registry where each block type contributes its own
 * ViewerComponent + EditorPanel. Keeping it tiny and generic now (no
 * Switch-specific defaults) avoids baking anything into the shell.
 */

interface BlockRendererProps {
  block: Block;
  orgSlug: string;
}

export function BlockRenderer({ block, orgSlug }: BlockRendererProps) {
  const navigate = useNavigate();
  const props = block.props as Record<string, unknown>;

  const align = (props.align as string) ?? 'left';
  const alignClass =
    align === 'center'
      ? 'text-center'
      : align === 'right'
        ? 'text-right'
        : 'text-left';

  switch (block.type) {
    case 'heading': {
      const level = Number(props.level ?? 1);
      const text = String(props.text ?? '');
      const underline = Boolean(props.underline);
      const cls = `font-bold ${alignClass} ${underline ? 'underline underline-offset-4' : ''} ${
        level === 1 ? 'text-3xl' : level === 2 ? 'text-2xl' : 'text-xl'
      }`;
      const style = { color: 'var(--th-heading)' };
      if (level === 1) return <h1 className={cls} style={style}>{text}</h1>;
      if (level === 2) return <h2 className={cls} style={style}>{text}</h2>;
      return <h3 className={cls} style={style}>{text}</h3>;
    }

    case 'paragraph': {
      // NOTE: Phase 1 sample HTML is trusted. Phase 3 sanitizes rich text
      // before render to prevent XSS.
      const html = String(props.html ?? '');
      return (
        <p
          className={`leading-relaxed ${alignClass}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    case 'divider': {
      const color = String(props.color ?? 'var(--th-text)');
      const thickness = Number(props.thickness ?? 1);
      const margin = Number(props.margin ?? 16);
      return (
        <hr
          style={{
            borderColor: color,
            borderTopWidth: thickness,
            marginTop: margin,
            marginBottom: margin,
          }}
        />
      );
    }

    case 'button': {
      const label = String(props.label ?? 'Button');
      const actionType = String(props.actionType ?? 'url');
      const target = String(props.target ?? '');
      const filled = (props.style ?? 'filled') === 'filled';
      const fullWidth = props.fullWidth !== false;
      const openInNewTab = Boolean(props.openInNewTab);

      const onClick = () => {
        if (actionType === 'page') {
          navigate(`/o/${orgSlug}/${target}`);
        } else if (actionType === 'url') {
          window.open(target, openInNewTab ? '_blank' : '_self', 'noopener');
        } else if (actionType === 'email') {
          window.location.href = `mailto:${target}`;
        } else if (actionType === 'phone') {
          window.location.href = `tel:${target}`;
        }
      };

      const base =
        'inline-flex items-center justify-center rounded-full px-6 py-3 font-semibold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
      const filledStyle = {
        backgroundColor: 'var(--th-primary)',
        color: 'var(--th-primary-text)',
      };
      const outlineStyle = {
        border: '2px solid var(--th-primary)',
        color: 'var(--th-primary)',
      };

      const wrapClass =
        align === 'center'
          ? 'flex justify-center'
          : align === 'right'
            ? 'flex justify-end'
            : 'flex justify-start';

      return (
        <div className={fullWidth ? '' : wrapClass}>
          <button
            type="button"
            onClick={onClick}
            className={`${base} ${fullWidth ? 'w-full' : ''}`}
            style={filled ? filledStyle : outlineStyle}
          >
            {label}
          </button>
        </div>
      );
    }

    case 'spacer': {
      return <div style={{ height: Number(props.height ?? 16) }} />;
    }

    default:
      return (
        <div className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-500">
          Unsupported block type "{block.type}" — full palette arrives in Phase 3.
        </div>
      );
  }
}
