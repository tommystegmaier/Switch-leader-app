import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { safeUrl } from '../sanitize';
import type { CountdownProps, MapProps, QrProps } from '../blockProps';

/** Embedded map from an address or "lat,lng" using Google Maps' embed URL. */
export function MapView({ props }: { props: MapProps }) {
  if (!props.query.trim()) {
    return <Placeholder label="Add an address or coordinates" />;
  }
  const src = `https://www.google.com/maps?q=${encodeURIComponent(props.query)}&output=embed`;
  return (
    <iframe
      title="Map"
      src={src}
      className="w-full rounded-xl border"
      style={{ height: props.height, borderColor: 'rgba(0,0,0,0.12)' }}
      loading="lazy"
    />
  );
}

export function QrView({ props }: { props: QrProps }) {
  const url = safeUrl(props.url);
  if (!url) return <Placeholder label="Add a URL to encode" />;
  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      <div className="rounded-xl bg-white p-3" style={{ border: '1px solid rgba(0,0,0,0.12)' }}>
        <QRCodeSVG value={url} size={props.size} />
      </div>
      {props.caption && <figcaption className="text-sm text-gray-500">{props.caption}</figcaption>}
    </figure>
  );
}

function diff(target: number) {
  const ms = Math.max(0, target - Date.now());
  const s = Math.floor(ms / 1000);
  return {
    done: ms === 0,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export function CountdownView({ props }: { props: CountdownProps }) {
  const target = props.target ? new Date(props.target).getTime() : NaN;
  const [, force] = useState(0);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (Number.isNaN(target)) return <Placeholder label="Set a target date & time" />;
  const t = diff(target);

  return (
    <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
      {props.label && <div className="mb-2 text-sm font-medium opacity-90">{props.label}</div>}
      {t.done ? (
        <div className="text-2xl font-bold">It&apos;s here! 🎉</div>
      ) : (
        <div className="flex items-center justify-center gap-3 tabular-nums">
          <Unit n={t.days} label="days" />
          <Unit n={t.hours} label="hrs" />
          <Unit n={t.minutes} label="min" />
          <Unit n={t.seconds} label="sec" />
        </div>
      )}
    </div>
  );
}

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-3xl font-bold">{String(n).padStart(2, '0')}</span>
      <span className="text-xs uppercase opacity-80">{label}</span>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed p-8 text-sm text-gray-400" style={{ borderColor: 'rgba(0,0,0,0.2)' }}>
      {label}
    </div>
  );
}
