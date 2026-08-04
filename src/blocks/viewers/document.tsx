import { lazy, Suspense } from 'react';

import { safeUrl } from '../sanitize';
import type { DocumentProps } from '../blockProps';

// Heavy (pdf.js) — only loaded when a document block actually renders.
const PdfViewer = lazy(() => import('./PdfViewer'));

/**
 * Document / PDF block. A weekly guide is one example use: an admin uploads (or
 * links) a PDF and all viewers see it instantly. Inline mode renders the
 * paginated viewer; link mode shows a simple open button.
 */
export function DocumentView({ props }: { props: DocumentProps }) {
  const url = safeUrl(props.url);

  if (!url) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">
        {props.title || 'Document'} — no PDF added yet.
      </div>
    );
  }

  if (props.displayMode === 'link') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-xl border px-4 py-3 hover:bg-black/5"
        style={{ borderColor: 'var(--th-hairline)' }}
      >
        <span className="text-2xl" aria-hidden>📄</span>
        <span className="font-medium underline">{props.title || 'Open document'}</span>
      </a>
    );
  }

  return (
    <Suspense fallback={<div className="rounded-xl border p-6 text-center text-sm text-gray-500">Loading viewer…</div>}>
      <PdfViewer url={url} title={props.title || 'Document'} />
    </Suspense>
  );
}
