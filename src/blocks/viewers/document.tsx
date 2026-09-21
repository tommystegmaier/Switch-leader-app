import { lazy, Suspense } from 'react';

import { BlockErrorBoundary } from '../BlockErrorBoundary';
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

  // The viewer is the one block heavy enough to have its own dependency
  // (pdf.js) that can fail on an old phone. If it does, show the document as a
  // plain link instead of losing the page around it.
  return (
    <BlockErrorBoundary
      fallback={() => (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--th-hairline)' }}>
          <p className="text-gray-500">This phone can&apos;t show the PDF inside the app.</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 font-medium underline"
          >
            <span aria-hidden>📄</span>
            {props.title || 'Open the document'}
          </a>
        </div>
      )}
    >
      <Suspense fallback={<div className="rounded-xl border p-6 text-center text-sm text-gray-500">Loading viewer…</div>}>
        <PdfViewer url={url} title={props.title || 'Document'} />
      </Suspense>
    </BlockErrorBoundary>
  );
}
