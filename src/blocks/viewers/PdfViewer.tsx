import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { safeUrl } from '../sanitize';

// Configure the pdf.js worker from the bundled dependency (Vite `?url` import),
// so the PDF block works offline-friendly without a CDN. Heavy; this component
// is loaded lazily by the document block.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * Inline PDF preview with page navigation (Page X / Y), zoom in/out,
 * open-in-new-tab (fullscreen), and a Refresh button that cache-busts so a
 * freshly uploaded file shows immediately.
 */
export default function PdfViewer({ url, title }: { url: string; title: string }) {
  const safe = safeUrl(url);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [bust, setBust] = useState(0); // increments to force a refetch
  const [error, setError] = useState(false);

  if (!safe) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-400">
        No PDF selected yet.
      </div>
    );
  }

  // Append a cache-busting param when Refresh is pressed.
  const fileUrl = bust > 0 ? `${safe}${safe.includes('?') ? '&' : '?'}_r=${bust}` : safe;

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'rgba(0,0,0,0.12)' }}>
      <div className="flex flex-wrap items-center gap-2 border-b bg-black/5 px-3 py-2 text-sm">
        <span className="mr-auto truncate font-medium">{title}</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10 disabled:opacity-40" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">‹</button>
        <span className="tabular-nums">Page {page} / {numPages || '—'}</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10 disabled:opacity-40" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages} aria-label="Next page">›</button>
        <span className="mx-1 h-4 w-px bg-black/20" />
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10" onClick={() => setScale((s) => Math.max(0.5, s - 0.2))} aria-label="Zoom out">−</button>
        <span className="tabular-nums">{Math.round(scale * 100)}%</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10" onClick={() => setScale((s) => Math.min(3, s + 0.2))} aria-label="Zoom in">+</button>
        <span className="mx-1 h-4 w-px bg-black/20" />
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10" onClick={() => { setError(false); setBust((b) => b + 1); }}>↻ Refresh</button>
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1 hover:bg-black/10">⛶ Open</a>
      </div>

      <div className="max-h-[70vh] overflow-auto bg-neutral-100 p-3 text-center">
        {error ? (
          <div className="p-6 text-sm text-gray-500">
            Couldn&apos;t load this PDF.{' '}
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="underline">Open it in a new tab</a>.
          </div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => { setNumPages(n); setPage((p) => Math.min(p, n)); }}
            onLoadError={() => setError(true)}
            loading={<div className="p-6 text-sm text-gray-500">Loading PDF…</div>}
          >
            <Page pageNumber={page} scale={scale} renderAnnotationLayer renderTextLayer />
          </Document>
        )}
      </div>
    </div>
  );
}
