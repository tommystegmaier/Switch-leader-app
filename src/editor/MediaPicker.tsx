import { useEffect, useRef, useState } from 'react';

import { deleteMedia, listMedia, uploadMedia, type MediaObject } from '@/lib/media';

/**
 * Media library + uploader modal. Upload a new file (to Supabase Storage under
 * the org) or pick a previously uploaded one. Returns the chosen public URL.
 *
 * Note: the storage SDK doesn't expose granular upload progress in the browser,
 * so we show an indeterminate "Uploading…" state rather than a percentage bar.
 */
export function MediaPicker({
  orgId,
  accept = 'image/*',
  onSelect,
  onClose,
}: {
  orgId: string;
  accept?: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listMedia(orgId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const obj = await uploadMedia(orgId, file);
      onSelect(obj.url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Media library">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Media library</h2>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-2xl leading-none hover:bg-black/10" aria-label="Close">×</button>
        </div>

        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={onFile} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mb-3 w-full rounded-lg py-3 font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
        >
          {uploading ? 'Uploading…' : '⬆ Upload a file'}
        </button>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No media yet — upload your first file.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <div key={item.name} className="group relative">
                <button
                  type="button"
                  onClick={() => { onSelect(item.url); onClose(); }}
                  className="block aspect-square w-full overflow-hidden rounded-lg border hover:ring-2 hover:ring-black/20"
                  style={{ borderColor: 'rgba(0,0,0,0.12)' }}
                >
                  {isPdf(item.url) ? (
                    <span className="flex h-full w-full items-center justify-center text-3xl">📄</span>
                  ) : (
                    <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={async () => { if (window.confirm('Delete this file?')) { await deleteMedia(item.name); void refresh(); } }}
                  className="absolute right-1 top-1 hidden rounded-full bg-white/90 px-1.5 text-xs text-red-600 shadow group-hover:block"
                  aria-label="Delete file"
                >🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
