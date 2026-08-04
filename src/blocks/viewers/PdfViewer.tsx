import { useEffect, useRef, useState } from 'react';
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
 *
 * The page auto-fits the width of its container (so it's readable on a phone
 * without side-scrolling). `zoom` is a multiplier on top of that fit width —
 * 100% = fits the screen, and the reader can zoom in for detail.
 */
const H_PADDING = 24; // matches the p-3 (12px each side) content padding

export default function PdfViewer({ url, title }: { url: string; title: string }) {
  const safe = safeUrl(url);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1); // 1 = fit to container width
  const [bust, setBust] = useState(0); // increments to force a refetch
  const [error, setError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Track the available width so the PDF page can scale to fit the screen.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(Math.max(0, el.clientWidth - H_PADDING));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = containerWidth > 0 ? containerWidth * zoom : undefined;

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
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--th-hairline)' }}>
      <div className="flex flex-wrap items-center gap-2 border-b bg-black/5 px-3 py-2 text-sm">
        <span className="mr-auto truncate font-medium">{title}</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10 disabled:opacity-40" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page">‹</button>
        <span className="tabular-nums">Page {page} / {numPages || '—'}</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10 disabled:opacity-40" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages} aria-label="Next page">›</button>
        <span className="mx-1 h-4 w-px bg-black/20" />
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2)))} aria-label="Zoom out">−</button>
        <button type="button" className="rounded px-1 py-1 tabular-nums hover:bg-black/10" onClick={() => setZoom(1)} title="Fit to screen">{Math.round(zoom * 100)}%</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))} aria-label="Zoom in">+</button>
        <span className="mx-1 h-4 w-px bg-black/20" />
        <button type="button" className="rounded px-2 py-1 hover:bg-black/10" onClick={() => { setError(false); setBust((b) => b + 1); }}>↻ Refresh</button>
        <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="rounded px-2 py-1 hover:bg-black/10">⛶ Open</a>
      </div>

      <div ref={contentRef} className="max-h-[70vh] overflow-auto bg-neutral-100 p-3 text-center">
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
            <Page pageNumber={page} width={pageWidth} renderAnnotationLayer renderTextLayer />
          </Document>
        )}
      </div>
    </div>
  );
}
