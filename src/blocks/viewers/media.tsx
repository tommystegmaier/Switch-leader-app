import { useEffect, useState } from 'react';

import { resolveAction, type ViewerCtx } from '../actions';
import { safeEmbedUrl, safeUrl } from '../sanitize';
import type {
  EmbedProps,
  GalleryProps,
  ImageProps,
  VideoProps,
} from '../blockProps';

export function ImageView({ props, ctx }: { props: ImageProps; ctx: ViewerCtx }) {
  const url = safeUrl(props.url);
  if (!url) return <Placeholder label="Add an image" />;

  const img = (
    <div className="relative" style={{ width: `${props.width}%`, maxWidth: '100%' }}>
      <img
        src={url}
        alt={props.alt}
        loading="lazy"
        className={`w-full ${props.rounded ? 'rounded-2xl' : ''}`}
      />
      {props.overlay && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-black/30 to-transparent" />
      )}
    </div>
  );

  const linked = resolveAction(props.link, ctx);
  const figure = (
    <figure className="m-0">
      {linked?.href != null ? (
        <a href={linked.href} target={linked.newTab ? '_blank' : undefined} rel={linked.newTab ? 'noopener noreferrer' : undefined}>{img}</a>
      ) : linked?.onClick ? (
        <button type="button" onClick={linked.onClick}>{img}</button>
      ) : (
        img
      )}
      {props.caption && (
        <figcaption className="mt-2 text-center text-sm text-gray-500">{props.caption}</figcaption>
      )}
    </figure>
  );
  return figure;
}

export function GalleryView({ props }: { props: GalleryProps }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const images = props.images.filter((i) => safeUrl(i.url));

  // Keyboard navigation when the lightbox is open.
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % images.length));
      if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, images.length]);

  if (images.length === 0) return <Placeholder label="Add gallery images" />;

  const colClass = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[props.columns];

  return (
    <>
      <div
        className={
          props.layout === 'carousel'
            ? 'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2'
            : `grid gap-3 ${colClass}`
        }
      >
        {images.map((img, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLightbox(i)}
            className={props.layout === 'carousel' ? 'shrink-0 snap-center' : ''}
            aria-label={img.alt || `Open image ${i + 1}`}
          >
            <img
              src={safeUrl(img.url) as string}
              alt={img.alt || ''}
              loading="lazy"
              className={`${props.layout === 'carousel' ? 'h-48 w-auto' : 'h-full w-full'} rounded-xl object-cover`}
            />
          </button>
        ))}
      </div>

      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button className="absolute right-4 top-4 text-3xl text-white" aria-label="Close" onClick={() => setLightbox(null)}>×</button>
          <button
            className="absolute left-4 text-4xl text-white"
            aria-label="Previous"
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! - 1 + images.length) % images.length); }}
          >‹</button>
          <figure className="m-0 max-h-full" onClick={(e) => e.stopPropagation()}>
            <img src={safeUrl(images[lightbox].url) as string} alt={images[lightbox].alt || ''} className="max-h-[80vh] max-w-full object-contain" />
            {images[lightbox].caption && (
              <figcaption className="mt-2 text-center text-sm text-white/80">{images[lightbox].caption}</figcaption>
            )}
          </figure>
          <button
            className="absolute right-4 text-4xl text-white"
            aria-label="Next"
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! + 1) % images.length); }}
          >›</button>
        </div>
      )}
    </>
  );
}

/** Parse a YouTube/Vimeo URL into an embeddable src; null if not recognized. */
function toVideoEmbed(raw: string): string | null {
  const url = safeUrl(raw);
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v');
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === 'youtu.be') return `https://www.youtube-nocookie.com/embed${u.pathname}`;
    if (host === 'vimeo.com') return `https://player.vimeo.com/video${u.pathname}`;
    return null;
  } catch {
    return null;
  }
}

export function VideoView({ props }: { props: VideoProps }) {
  const embed = toVideoEmbed(props.url);
  const direct = safeUrl(props.url);

  if (embed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl">
        <iframe
          src={embed}
          title="Video"
          className="h-full w-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (direct && /\.(mp4|webm|ogg|mov)(\?|$)/i.test(direct)) {
    return <video src={direct} controls className="aspect-video w-full rounded-xl bg-black" />;
  }
  return <Placeholder label="Add a YouTube/Vimeo link or video file" />;
}

export function EmbedView({ props }: { props: EmbedProps }) {
  const src = safeEmbedUrl(props.url);
  if (!src) return <Placeholder label="Add an embed URL (allowlisted providers)" />;
  return (
    <iframe
      src={src}
      title={props.title || 'Embedded content'}
      className="w-full rounded-xl border"
      style={{ height: props.height, borderColor: 'var(--th-hairline)' }}
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
    />
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed p-8 text-sm text-gray-400" style={{ borderColor: 'var(--th-hairline-strong)' }}>
      {label}
    </div>
  );
}
