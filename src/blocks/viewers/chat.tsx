import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import {
  useChatChannels, useChatMessages, useChatMutes, useChatPollVotes, useChatReactions, useMarkChatRead,
  useSendChatMessage, useSetChatMute, useToggleReaction, useVoteChatPoll,
  type ChatMessage,
} from '@/data/chatHooks';
import { errorMessage } from '@/lib/errors';
import { uploadMedia } from '@/lib/media';
import type { ViewerCtx } from '../actions';

interface ChatProps { title?: string }

const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

const card = 'rounded-xl border';
const cardStyle = { borderColor: 'var(--th-hairline)' } as const;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ChatView({ props, ctx }: { props: ChatProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { user } = useAuth();
  const { isLoading: roleLoading } = useMembershipRole(org?.id);
  const title = props.title || 'Chat';

  if (ctx.editing) {
    return (
      <div className={`${card} p-4`} style={cardStyle}>
        <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>💬 {title}</p>
        <p className="mt-1 text-sm text-gray-500">Group chat. Each channel is a Roster group — managers see all, everyone else sees only the groups they&apos;re assigned to. Add people to Roster groups to populate channels.</p>
      </div>
    );
  }

  if (!org || roleLoading) return <div className={`${card} p-4`} style={cardStyle}><p className="text-sm text-gray-500">Loading chat…</p></div>;

  if (!user) {
    return (
      <div className={`${card} p-4`} style={cardStyle}>
        <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>💬 {title}</p>
        <p className="mt-1 text-sm text-gray-600">Sign in to see your group chats.</p>
        <a href={`/login?next=/o/${org.slug}`} className="mt-3 inline-block rounded-full px-5 py-2.5 text-sm font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Sign in</a>
      </div>
    );
  }

  return <ChatInner orgId={org.id} title={title} userId={user.id} authorName={displayName(user)} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function displayName(user: any): string {
  const m = user?.user_metadata ?? {};
  return (m.full_name || m.name || user?.email || 'Someone') as string;
}

function ChatInner({ orgId, title, userId, authorName }: { orgId: string; title: string; userId: string; authorName: string }) {
  const { data: channels } = useChatChannels(orgId);
  const { data: mutes } = useChatMutes(orgId);
  const setMute = useSetChatMute(orgId);
  const [active, setActive] = useState<string | null>(null);
  const markRead = useMarkChatRead(orgId);
  const mutedSet = new Set(mutes ?? []);

  // Land on the subgroup they're in first (prefer an unread one), falling back
  // to any subgroup, then any unread channel, then the first channel.
  useEffect(() => {
    if (active || !channels || channels.length === 0) return;
    const pick =
      channels.find((c) => c.parentId && c.unread > 0) ??
      channels.find((c) => c.parentId) ??
      channels.find((c) => c.unread > 0) ??
      channels[0];
    setActive(pick.groupId);
  }, [channels, active]);

  const list = channels ?? [];
  const activeCh = list.find((c) => c.groupId === active);
  // Show the larger (parent) group in the header; fall back to the channel's
  // own name (top-level groups) or the block title.
  const headerName = activeCh?.parentName || activeCh?.name || title;
  if (list.length === 0) {
    return (
      <div className={`${card} p-4`} style={cardStyle}>
        <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>💬 {title}</p>
        <p className="mt-2 text-sm text-gray-500">No group chats yet. You&apos;ll see a channel here for each Roster group you&apos;re part of.</p>
      </div>
    );
  }

  return (
    <div className={`${card} flex flex-col`} style={{ ...cardStyle, height: 'min(70vh, 640px)' }}>
      <div className="flex items-center gap-2 border-b px-4 py-3" style={cardStyle}>
        <p className="min-w-0 flex-1 truncate font-semibold" style={{ color: 'var(--th-heading)' }}>💬 {headerName}</p>
        {active && (
          <button
            type="button"
            onClick={() => setMute.mutate({ groupId: active, muted: !mutedSet.has(active) })}
            className="shrink-0 rounded-full px-2 py-1 text-lg"
            title={mutedSet.has(active) ? 'Notifications off for this channel — tap to turn on' : 'Notifications on for this channel — tap to mute'}
            aria-label="Toggle notifications for this channel"
          >
            {mutedSet.has(active) ? '🔕' : '🔔'}
          </button>
        )}
      </div>

      {/* Channel tabs */}
      <div className="flex gap-2 overflow-x-auto border-b px-3 py-2" style={cardStyle}>
        {list.map((c) => {
          const on = c.groupId === active;
          return (
            <button
              key={c.groupId}
              type="button"
              onClick={() => setActive(c.groupId)}
              className={`relative shrink-0 rounded-full px-3 py-1 text-sm ${on ? 'font-semibold' : 'opacity-70'}`}
              style={on ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' } : { border: '1px solid var(--th-hairline-strong)' }}
            >
              {c.name}
              {c.unread > 0 && !on && (
                <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[0.65rem] font-bold text-white">{c.unread > 99 ? '99+' : c.unread}</span>
              )}
            </button>
          );
        })}
      </div>

      {active && <ChannelPane orgId={orgId} groupId={active} userId={userId} authorName={authorName} onSeen={() => markRead.mutate(active)} />}
    </div>
  );
}

interface PollTally { counts: Record<number, number>; total: number; mine: number | null }

function ChannelPane({ orgId, groupId, userId, authorName, onSeen }: { orgId: string; groupId: string; userId: string; authorName: string; onSeen: () => void }) {
  const { data: messages } = useChatMessages(orgId, groupId);
  const { data: reactions } = useChatReactions(orgId, groupId);
  const { data: pollVotes } = useChatPollVotes(orgId, groupId);
  const send = useSendChatMessage(orgId);
  const toggle = useToggleReaction(orgId);
  const vote = useVoteChatPoll(orgId);

  const [text, setText] = useState('');
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const msgs = useMemo(() => messages ?? [], [messages]);

  // Poll votes grouped by message → { counts per option, total, my choice }.
  const pollByMessage = useMemo(() => {
    const map = new Map<string, PollTally>();
    for (const v of pollVotes ?? []) {
      const cur = map.get(v.messageId) ?? { counts: {}, total: 0, mine: null };
      cur.counts[v.optionIndex] = (cur.counts[v.optionIndex] ?? 0) + 1;
      cur.total += 1;
      if (v.userId === userId) cur.mine = v.optionIndex;
      map.set(v.messageId, cur);
    }
    return map;
  }, [pollVotes, userId]);

  // Mark read + scroll to bottom whenever the message set changes.
  useEffect(() => {
    onSeen();
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, msgs.length]);

  // Reactions grouped by message → emoji → { count, mine }.
  const byMessage = useMemo(() => {
    const map = new Map<string, Map<string, { count: number; mine: boolean }>>();
    for (const r of reactions ?? []) {
      if (!map.has(r.messageId)) map.set(r.messageId, new Map());
      const em = map.get(r.messageId)!;
      const cur = em.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.userId === userId) cur.mine = true;
      em.set(r.emoji, cur);
    }
    return map;
  }, [reactions, userId]);

  async function onSend() {
    if (!text.trim()) return;
    setError(null);
    const body = text;
    setText('');
    try { await send.mutateAsync({ groupId, userId, authorName, body }); }
    catch (e) { setError(errorMessage(e)); setText(body); }
  }

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setAttachOpen(false);
    setUploading(true); setError(null);
    try {
      const m = await uploadMedia(orgId, file);
      await send.mutateAsync({ groupId, userId, authorName, imageUrl: m.url, mediaKind: 'photo' });
    } catch (err) { setError(errorMessage(err)); }
    finally { setUploading(false); input.value = ''; }
  }

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setAttachOpen(false);
    if (file.size > 50 * 1024 * 1024) {
      setError('That video is too large (max 50 MB). Try a shorter clip.');
      input.value = '';
      return;
    }
    setUploading(true); setError(null);
    try {
      const m = await uploadMedia(orgId, file);
      await send.mutateAsync({ groupId, userId, authorName, videoUrl: m.url, mediaKind: 'video' });
    } catch (err) { setError(errorMessage(err)); }
    finally { setUploading(false); input.value = ''; }
  }

  function react(messageId: string, emoji: string, mine: boolean) {
    toggle.mutate({ groupId, messageId, userId, emoji, on: !mine });
    setReactingId(null);
  }

  async function postPoll(question: string, options: string[]) {
    setError(null);
    try { await send.mutateAsync({ groupId, userId, authorName, body: question, poll: { options } }); setPollOpen(false); }
    catch (e) { setError(errorMessage(e)); }
  }

  async function sendGif(url: string) {
    setError(null);
    try { await send.mutateAsync({ groupId, userId, authorName, imageUrl: url, mediaKind: 'gif' }); setGifOpen(false); }
    catch (e) { setError(errorMessage(e)); }
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {msgs.length === 0 && <p className="pt-8 text-center text-sm text-gray-400">No messages yet — say hi 👋</p>}
        {msgs.map((m) => (
          <MessageRow
            key={m.id}
            m={m}
            mine={m.userId === userId}
            reactions={byMessage.get(m.id)}
            poll={m.poll ? pollByMessage.get(m.id) : undefined}
            onVote={(opt) => vote.mutate({ groupId, messageId: m.id, option: opt })}
            open={reactingId === m.id}
            onToggleBar={() => setReactingId((id) => (id === m.id ? null : m.id))}
            onReact={(emoji, wasMine) => react(m.id, emoji, wasMine)}
          />
        ))}
      </div>

      {error && <p className="px-4 text-xs text-red-600">{error}</p>}

      <div className="relative border-t" style={cardStyle}>
        {/* iMessage-style "+" attachment menu */}
        {attachOpen && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setAttachOpen(false)} />
            <div className="absolute bottom-full left-2 z-50 mb-2 w-56 overflow-hidden rounded-2xl border shadow-xl" style={{ backgroundColor: 'var(--th-surface)', borderColor: 'var(--th-hairline)' }}>
              <AttachRow icon={<CameraIcon />} label="Camera" onClick={() => { setAttachOpen(false); cameraRef.current?.click(); }} />
              <AttachRow icon={<PhotosIcon />} label="Photos" onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} />
              <AttachRow icon={<VideoIcon />} label="Video" onClick={() => { setAttachOpen(false); videoRef.current?.click(); }} />
              <AttachRow icon={<PollsIcon />} label="Polls" onClick={() => { setAttachOpen(false); setPollOpen(true); }} />
              <AttachRow icon={<GifIcon />} label="GIF" onClick={() => { setAttachOpen(false); setGifOpen(true); }} last />
            </div>
          </>
        )}

        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            disabled={uploading}
            aria-label="Add attachment"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xl leading-none disabled:opacity-50"
            style={{ backgroundColor: 'var(--th-hairline)', color: 'var(--th-text)' }}
          >
            {uploading ? '⏳' : '+'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} />
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={onPickVideo} />
          <input
            className="min-w-0 flex-1 rounded-full border px-4 py-2 text-sm focus:outline-none focus-visible:ring-2"
            style={{ borderColor: 'var(--th-hairline-strong)' }}
            placeholder="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend(); } }}
          />
          {text.trim() && (
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={send.isPending}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none disabled:opacity-50"
              style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
            >
              ↑
            </button>
          )}
        </div>
      </div>

      {pollOpen && <PollComposer busy={send.isPending} onCancel={() => setPollOpen(false)} onPost={postPoll} />}
      {gifOpen && <GifPicker onCancel={() => setGifOpen(false)} onPick={sendGif} />}
    </>
  );
}

/** One row of the iMessage-style "+" attachment menu. */
function AttachRow({ icon, label, onClick, last }: { icon: ReactNode; label: string; onClick: () => void; last?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/5 ${last ? '' : 'border-b'}`}
      style={last ? undefined : { borderColor: 'var(--th-hairline)' }}
    >
      {icon}
      <span className="text-base font-medium" style={{ color: 'var(--th-text)' }}>{label}</span>
    </button>
  );
}

function IconCircle({ bg, children }: { bg: string; children?: ReactNode }) {
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: bg }} aria-hidden>{children}</span>;
}
const CameraIcon = () => (
  <IconCircle bg="#6b7280">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></svg>
  </IconCircle>
);
const PhotosIcon = () => <IconCircle bg="conic-gradient(from 210deg, #f94144, #f9c74f, #90be6d, #43aa8b, #577590, #f94144)" />;
const PollsIcon = () => (
  <IconCircle bg="#f59e0b">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><rect x="4" y="6" width="12" height="3" rx="1.5" /><rect x="4" y="11" width="16" height="3" rx="1.5" /><rect x="4" y="16" width="9" height="3" rx="1.5" /></svg>
  </IconCircle>
);
const VideoIcon = () => (
  <IconCircle bg="#ef4444">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M4 6h11a1 1 0 0 1 1 1v3.2l4-2.4v8.4l-4-2.4V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" /></svg>
  </IconCircle>
);
const GifIcon = () => (
  <IconCircle bg="#111827"><span className="text-[0.6rem] font-bold text-white">GIF</span></IconCircle>
);

/** Compose a poll: a question and 2–6 options. */
function PollComposer({ busy, onCancel, onPost }: { busy: boolean; onCancel: () => void; onPost: (question: string, options: string[]) => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const clean = options.map((o) => o.trim()).filter(Boolean);
  const canPost = question.trim().length > 0 && clean.length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <h3 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>New poll</h3>
        <input
          autoFocus
          className="mt-3 w-full rounded-lg border px-3 py-2.5 text-base"
          style={{ borderColor: 'var(--th-hairline-strong)' }}
          placeholder="Ask a question…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="mt-3 flex flex-col gap-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--th-hairline-strong)' }}
                placeholder={`Option ${i + 1}`}
                value={o}
                onChange={(e) => setOptions((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
              />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 text-gray-400" aria-label="Remove option">✕</button>
              )}
            </div>
          ))}
        </div>
        {options.length < 6 && (
          <button type="button" onClick={() => setOptions((prev) => [...prev, ''])} className="mt-2 text-sm underline" style={{ color: 'var(--th-text)' }}>+ Add option</button>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={!canPost || busy} onClick={() => onPost(question.trim(), clean)} className="rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>
            {busy ? 'Posting…' : 'Post poll'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-full px-5 py-2.5 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

interface Gif { id: string; preview: string | null; url: string }

/** Search GIPHY (via /api/gif-search) and tap a GIF to send it. */
function GifPicker({ onCancel, onPick }: { onCancel: () => void; onPick: (url: string) => void }) {
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/gif-search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        if (cancelled) return;
        setConfigured(d.configured !== false);
        setGifs(Array.isArray(d.gifs) ? d.gifs : []);
      } catch { if (!cancelled) setGifs([]); }
      finally { if (!cancelled) setLoading(false); }
    }, q ? 350 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        className="relative z-10 flex w-full max-w-md flex-col rounded-t-2xl bg-white p-4 shadow-xl"
        style={{ maxHeight: '58vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full" style={{ backgroundColor: 'var(--th-hairline-strong)' }} aria-hidden />
        <div className="flex items-center gap-2">
          <input
            className="min-w-0 flex-1 rounded-full border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--th-hairline-strong)' }}
            placeholder="Search GIFs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full px-2 text-2xl leading-none text-gray-400 hover:bg-black/5">×</button>
        </div>
        <div className="mt-3 flex-1 overflow-y-auto">
          {loading && <p className="py-6 text-center text-sm text-gray-400">Loading…</p>}
          {!loading && !configured && <p className="py-6 text-center text-sm text-gray-500">GIF search isn’t set up yet. (Add a GIPHY API key on the server.)</p>}
          {!loading && configured && gifs.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No GIFs found.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {gifs.map((g) => (
              <button key={g.id} type="button" onClick={() => onPick(g.url)} className="overflow-hidden rounded-lg">
                <img src={g.preview || g.url} alt="" className="h-28 w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
        {configured && <p className="pt-2 text-center text-[0.65rem] text-gray-400">Powered by GIPHY</p>}
      </div>
    </div>
  );
}

function MessageRow({ m, mine, reactions, poll, onVote, open, onToggleBar, onReact }: {
  m: ChatMessage;
  mine: boolean;
  reactions: Map<string, { count: number; mine: boolean }> | undefined;
  poll: PollTally | undefined;
  onVote: (option: number) => void;
  open: boolean;
  onToggleBar: () => void;
  onReact: (emoji: string, wasMine: boolean) => void;
}) {
  // A poll renders as a tappable, live-tallied card instead of a chat bubble.
  if (m.poll) {
    const opts = m.poll.options;
    const total = poll?.total ?? 0;
    return (
      <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && m.authorName && <span className="mb-0.5 px-1 text-xs text-gray-500">{m.authorName}</span>}
        <div className="w-full max-w-[85%] rounded-2xl border px-3 py-2.5" style={{ borderColor: 'var(--th-hairline-strong)', backgroundColor: 'var(--th-surface)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--th-heading)' }}>📊 {m.body}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {opts.map((o, i) => {
              const c = poll?.counts[i] ?? 0;
              const pct = total ? Math.round((c / total) * 100) : 0;
              const isMine = poll?.mine === i;
              return (
                <button key={i} type="button" onClick={() => onVote(i)} className="relative block w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left" style={{ borderColor: isMine ? 'var(--th-primary)' : 'var(--th-hairline-strong)' }}>
                  <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: 'color-mix(in srgb, var(--th-primary) 16%, transparent)' }} aria-hidden />
                  <span className="relative flex items-center justify-between gap-2 text-sm">
                    <span style={{ color: 'var(--th-text)' }}>{isMine ? '✓ ' : ''}{o}</span>
                    <span className="tabular-nums text-gray-500">{c} · {pct}%</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[0.65rem] text-gray-400">{total} vote{total === 1 ? '' : 's'} · tap to vote, tap again to remove yours</p>
        </div>
        <span className="mt-0.5 px-1 text-[0.65rem] text-gray-400">{fmtTime(m.createdAt)}</span>
      </div>
    );
  }

  const pills = reactions ? Array.from(reactions.entries()) : [];
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      {!mine && m.authorName && <span className="mb-0.5 px-1 text-xs text-gray-500">{m.authorName}</span>}
      <div className="relative max-w-[85%]">
        <button
          type="button"
          onClick={onToggleBar}
          className="block text-left"
          style={{ cursor: 'pointer' }}
        >
          <div
            className="whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm"
            style={mine
              ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }
              : { backgroundColor: 'var(--th-hairline)', color: 'var(--th-text)' }}
          >
            {m.imageUrl && <img src={m.imageUrl} alt="" className="mb-1 max-h-64 rounded-lg object-cover" />}
            {m.videoUrl && <video src={m.videoUrl} controls playsInline onClick={(e) => e.stopPropagation()} className="mb-1 max-h-64 w-full rounded-lg" />}
            {m.body}
          </div>
        </button>

        {open && (
          <div className={`absolute z-10 mt-1 flex gap-1 rounded-full border bg-white px-2 py-1 shadow ${mine ? 'right-0' : 'left-0'}`} style={cardStyle}>
            {REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => onReact(e, Boolean(reactions?.get(e)?.mine))} className="text-lg leading-none hover:scale-110">{e}</button>
            ))}
          </div>
        )}
      </div>

      {pills.length > 0 && (
        <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
          {pills.map(([emoji, info]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(emoji, info.mine)}
              className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs"
              style={{ borderColor: info.mine ? 'var(--th-primary)' : 'var(--th-hairline-strong)', backgroundColor: info.mine ? 'color-mix(in srgb, var(--th-primary) 12%, transparent)' : 'transparent' }}
            >
              <span>{emoji}</span><span className="text-gray-600">{info.count}</span>
            </button>
          ))}
        </div>
      )}

      <span className="mt-0.5 px-1 text-[0.65rem] text-gray-400">{fmtTime(m.createdAt)}</span>
    </div>
  );
}
