import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import {
  useChatChannels, useChatMessages, useChatMutes, useChatPollVotes, useChatReactions, useDeleteChatMessage,
  useMarkChatRead, useSendChatMessage, useSetChatMute, useSetChatPostPolicy, useToggleReaction, useVoteChatPoll,
  type ChatMessage, type ChatPostPolicy,
} from '@/data/chatHooks';
import { errorMessage } from '@/lib/errors';
import { compressImage, uploadMedia } from '@/lib/media';
import type { ViewerCtx } from '../actions';

interface ChatProps { title?: string }

const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

const card = 'rounded-xl border';
const cardStyle = { borderColor: 'var(--th-hairline)' } as const;

/** mm:ss for a number of seconds. */
function fmtDuration(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Turn URLs inside a message into clickable links (opens in a new tab). Keeps
// the plain text between links intact. Underlined + inherits the bubble's text
// color so it stays readable on both the sent (colored) and received bubbles.
const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const raw = m[0];
    if (m.index > last) out.push(text.slice(last, m.index));
    // Don't swallow trailing punctuation (e.g. "see foo.com." or "(bar.com)").
    const trail = raw.match(/[.,!?;:)\]]+$/)?.[0] ?? '';
    const link = trail ? raw.slice(0, -trail.length) : raw;
    const href = link.startsWith('http') ? link : `https://${link}`;
    out.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        style={{ wordBreak: 'break-word' }}
        onClick={(e) => e.stopPropagation()}
      >
        {link}
      </a>,
    );
    if (trail) out.push(trail);
    last = m.index + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ChatView({ props, ctx }: { props: ChatProps; ctx: ViewerCtx }) {
  const { data: org } = useOrganization(ctx.orgSlug);
  const { user } = useAuth();
  const { role, isLoading: roleLoading } = useMembershipRole(org?.id);
  const title = props.title || 'Chat';
  // Owners/admins/editors (managers) can delete ANY message (moderation);
  // everyone else can delete only their own. Matches the RLS delete policy.
  const canModerate = role === 'owner' || role === 'admin' || role === 'editor';
  // Only owners/admins can change a channel's posting policy.
  const canConfigure = role === 'owner' || role === 'admin';

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

  return <ChatInner orgId={org.id} title={title} userId={user.id} authorName={displayName(user)} canModerate={canModerate} canConfigure={canConfigure} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function displayName(user: any): string {
  const m = user?.user_metadata ?? {};
  return (m.full_name || m.name || user?.email || 'Someone') as string;
}

function ChatInner({ orgId, title, userId, authorName, canModerate, canConfigure }: { orgId: string; title: string; userId: string; authorName: string; canModerate: boolean; canConfigure: boolean }) {
  const { data: channels } = useChatChannels(orgId);
  const { data: mutes } = useChatMutes(orgId);
  const setMute = useSetChatMute(orgId);
  const setPolicy = useSetChatPostPolicy(orgId);
  const [active, setActive] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
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
        {canConfigure && activeCh?.isAll && (
          <button
            type="button"
            onClick={() => setPolicyOpen(true)}
            className="shrink-0 rounded-full px-2 py-1 text-lg"
            title="Who can post in this channel"
            aria-label="Channel posting settings"
          >
            ⚙️
          </button>
        )}
        {canModerate && (
          <button
            type="button"
            onClick={() => setDeleteMode((v) => !v)}
            className="shrink-0 rounded-full px-2 py-1 text-lg"
            style={deleteMode ? { backgroundColor: 'color-mix(in srgb, #dc2626 18%, transparent)' } : { opacity: 0.6 }}
            title={deleteMode ? 'Delete mode ON — tap to hide the delete buttons' : 'Delete mode OFF — tap to show delete buttons on messages'}
            aria-pressed={deleteMode}
            aria-label="Toggle delete mode"
          >
            🗑️
          </button>
        )}
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

      {active && <ChannelPane orgId={orgId} groupId={active} userId={userId} authorName={authorName} canModerate={canModerate} deleteMode={deleteMode} canPost={activeCh?.canPost ?? true} onSeen={() => markRead.mutate(active)} />}

      {policyOpen && activeCh && (
        <PostPolicyChooser
          current={activeCh.postPolicy}
          busy={setPolicy.isPending}
          onChoose={(p) => { setPolicy.mutate({ groupId: activeCh.groupId, policy: p }); setPolicyOpen(false); }}
          onCancel={() => setPolicyOpen(false)}
        />
      )}
    </div>
  );
}

/** Owner/admin picks who may post in a channel (used for All Leaders). */
function PostPolicyChooser({ current, busy, onChoose, onCancel }: { current: ChatPostPolicy; busy: boolean; onChoose: (p: ChatPostPolicy) => void; onCancel: () => void }) {
  const options: { value: ChatPostPolicy; label: string; hint: string }[] = [
    { value: 'all', label: 'Everyone', hint: 'Anyone on the roster can post here.' },
    { value: 'managers', label: 'Owners, admins & editors only', hint: 'Leaders can post; everyone else can read.' },
    { value: 'managers_coaches', label: 'Owners, admins, editors & coaches', hint: 'Leaders and coaches can post; everyone else can read.' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
        <h3 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>Who can post here?</h3>
        <p className="mt-1 text-sm text-gray-500">Everyone can still read the channel — this only controls who can send messages.</p>
        <div className="mt-4 flex flex-col gap-2">
          {options.map((o) => {
            const on = o.value === current;
            return (
              <button
                key={o.value}
                type="button"
                disabled={busy}
                onClick={() => onChoose(o.value)}
                className="rounded-xl border p-3 text-left disabled:opacity-50"
                style={{ borderColor: on ? 'var(--th-primary)' : 'var(--th-hairline-strong)', boxShadow: on ? '0 0 0 2px var(--th-primary)' : undefined }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold" style={{ color: 'var(--th-heading)' }}>{o.label}</span>
                  {on && <span style={{ color: 'var(--th-primary)' }}>✓</span>}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">{o.hint}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={onCancel} className="mt-4 rounded-full px-5 py-2.5 text-sm">Close</button>
      </div>
    </div>
  );
}

interface PollTally { counts: Record<number, number>; total: number; mine: number | null }
interface PendingMedia { file: File; url: string; kind: 'photo' | 'audio' }

function ChannelPane({ orgId, groupId, userId, authorName, canModerate, deleteMode, canPost, onSeen }: { orgId: string; groupId: string; userId: string; authorName: string; canModerate: boolean; deleteMode: boolean; canPost: boolean; onSeen: () => void }) {
  const { data: messages } = useChatMessages(orgId, groupId);
  const { data: reactions } = useChatReactions(orgId, groupId);
  const { data: pollVotes } = useChatPollVotes(orgId, groupId);
  const send = useSendChatMessage(orgId);
  const toggle = useToggleReaction(orgId);
  const vote = useVoteChatPoll(orgId);
  const del = useDeleteChatMessage(orgId);

  const [text, setText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Picking photos does NOT upload — it just stages them as previews (like the
  // phone). Nothing is sent until the person taps Send, so they can remove an
  // item or add a caption first. Multiple photos are allowed; only images are
  // accepted (video sending has been retired).
  function onPickMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = '';
    setAttachOpen(false);
    if (files.length === 0) return;
    const additions: PendingMedia[] = files
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({ file, url: URL.createObjectURL(file), kind: 'photo' as const }));
    if (additions.length) setPending((prev) => [...prev, ...additions]);
  }

  // A finished voice recording gets staged just like a photo, so it goes out
  // with the next Send (with an optional caption).
  function stageAudio(file: File) {
    setAudioOpen(false);
    setPending((prev) => [...prev, { file, url: URL.createObjectURL(file), kind: 'audio' }]);
  }

  function removePending(i: number) {
    setPending((prev) => {
      const item = prev[i];
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  // Send the staged media (uploading now) plus any text. The text rides along
  // as the caption on the first item; extra media follow as their own bubbles.
  async function onSend() {
    const body = text.trim();
    if (!body && pending.length === 0) return;
    setError(null);
    const items = pending;
    const savedText = text;
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setPending([]);
    setUploading(items.length > 0);
    try {
      if (items.length === 0) {
        await send.mutateAsync({ groupId, userId, authorName, body });
      } else {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          // Shrink photos before upload so they don't eat storage; audio is
          // already small and uploads as-is.
          const file = it.kind === 'photo' ? await compressImage(it.file) : it.file;
          const m = await uploadMedia(orgId, file);
          await send.mutateAsync({
            groupId, userId, authorName,
            body: i === 0 && body ? body : undefined,
            imageUrl: it.kind === 'photo' ? m.url : undefined,
            audioUrl: it.kind === 'audio' ? m.url : undefined,
            mediaKind: it.kind,
          });
        }
        items.forEach((it) => URL.revokeObjectURL(it.url));
      }
    } catch (e) {
      const msg = errorMessage(e);
      // Translate the two failures people actually hit into plain language.
      setError(
        /row-level security|violates .*policy|not authorized|permission/i.test(msg)
          ? 'Couldn’t upload that — your account may not have permission to attach files yet. Ask an admin to run the latest update.'
        : /audio_url|chat_messages_media_check|column .* does not exist/i.test(msg)
          ? 'Voice messages aren’t enabled on this app yet. Ask an admin to run the latest database update.'
        : msg,
      );
      setText(savedText);
      setPending(items); // keep previews so they can retry
    } finally {
      setUploading(false);
    }
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
            // Managers: the × shows on every message only when delete mode is
            // on (a clean, deliberate moderation mode). Everyone else: the × is
            // always available on their own messages.
            canDelete={canModerate ? deleteMode : m.userId === userId}
            reactions={byMessage.get(m.id)}
            poll={m.poll ? pollByMessage.get(m.id) : undefined}
            onVote={(opt) => vote.mutate({ groupId, messageId: m.id, option: opt })}
            open={reactingId === m.id}
            onToggleBar={() => setReactingId((id) => (id === m.id ? null : m.id))}
            onReact={(emoji, wasMine) => react(m.id, emoji, wasMine)}
            onRequestDelete={() => { setReactingId(null); setConfirmDelete(m); }}
          />
        ))}
      </div>

      {error && <p className="px-4 text-xs text-red-600">{error}</p>}

      {canPost ? (
      <div className="relative border-t" style={cardStyle}>
        {/* iMessage-style "+" attachment menu */}
        {attachOpen && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setAttachOpen(false)} />
            <div className="absolute bottom-full left-2 z-50 mb-2 w-56 overflow-hidden rounded-2xl border shadow-xl" style={{ backgroundColor: 'var(--th-surface)', borderColor: 'var(--th-hairline)' }}>
              <AttachRow icon={<CameraIcon />} label="Camera" onClick={() => { setAttachOpen(false); cameraRef.current?.click(); }} />
              <AttachRow icon={<PhotosIcon />} label="Photos" onClick={() => { setAttachOpen(false); fileRef.current?.click(); }} />
              <AttachRow icon={<AudioIcon />} label="Audio" onClick={() => { setAttachOpen(false); setAudioOpen(true); }} />
              <AttachRow icon={<PollsIcon />} label="Polls" onClick={() => { setAttachOpen(false); setPollOpen(true); }} />
              <AttachRow icon={<GifIcon />} label="GIF" onClick={() => { setAttachOpen(false); setGifOpen(true); }} last />
            </div>
          </>
        )}

        {/* Staged attachments — shown as removable previews; nothing uploads
            until Send. */}
        {pending.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-2">
            {pending.map((p, i) => (
              <div key={i} className="relative shrink-0">
                {p.kind === 'audio'
                  ? <span className="flex h-16 w-16 items-center justify-center rounded-lg text-2xl" style={{ backgroundColor: 'var(--th-hairline)' }} aria-label="Voice recording">🎙️</span>
                  : <img src={p.url} alt="" className="h-16 w-16 rounded-lg object-cover" />}
                <button type="button" onClick={() => removePending(i)} aria-label="Remove" className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs leading-none text-white">×</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            aria-label="Add attachment"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-2xl leading-none"
            style={{ backgroundColor: 'var(--th-hairline)', color: 'var(--th-text)' }}
          >
            +
          </button>
          {/* Camera takes a photo; Photos opens the library (multiple). Photos
              only — video sending has been retired. */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickMedia} />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickMedia} />
          <textarea
            ref={inputRef}
            rows={1}
            className="min-w-0 flex-1 resize-none rounded-2xl border px-4 py-2 text-sm leading-snug focus:outline-none focus-visible:ring-2"
            style={{ borderColor: 'var(--th-hairline-strong)', maxHeight: '9rem' }}
            placeholder="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 144)}px`; }}
            // Enter adds a new line (so lists/paragraphs keep their formatting);
            // tap the Send button — or Cmd/Ctrl+Enter — to send.
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void onSend(); } }}
          />
          {(text.trim() || pending.length > 0) && (
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={uploading || send.isPending}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg leading-none disabled:opacity-50"
              style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}
            >
              {uploading ? '⏳' : '↑'}
            </button>
          )}
        </div>
      </div>
      ) : (
        <div className="border-t px-4 py-3 text-center text-sm text-gray-500" style={cardStyle}>
          🔒 This channel is read only.
        </div>
      )}

      {pollOpen && <PollComposer busy={send.isPending} onCancel={() => setPollOpen(false)} onPost={postPoll} />}
      {gifOpen && <GifPicker onCancel={() => setGifOpen(false)} onPick={sendGif} />}
      {audioOpen && <AudioRecorder onCancel={() => setAudioOpen(false)} onDone={stageAudio} />}
      {confirmDelete && (
        <ConfirmDelete
          deleting={del.isPending}
          onConfirm={async () => {
            try { await del.mutateAsync({ groupId, messageId: confirmDelete.id }); }
            catch (e) { setError(errorMessage(e)); }
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
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
  <IconCircle bg="#8e8e93">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <circle cx="12" cy="12" r="6.4" fill="none" stroke="#fff" strokeWidth={2} />
      <circle cx="12" cy="12" r="2.6" fill="#fff" />
    </svg>
  </IconCircle>
);
const PHOTO_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'];
const PhotosIcon = () => (
  <IconCircle bg="#ffffff">
    <svg viewBox="0 0 36 36" width="30" height="30" aria-hidden>
      <g transform="translate(18 18)">
        {PHOTO_COLORS.map((c, i) => (
          <ellipse key={i} cx="0" cy="-5" rx="4.4" ry="8.2" fill={c} opacity="0.82" transform={`rotate(${i * 60})`} />
        ))}
        <circle r="3" fill="#fff" />
      </g>
    </svg>
  </IconCircle>
);
const AudioIcon = () => (
  <IconCircle bg="#34c759">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="#fff" strokeWidth={2} />
      <rect x="11" y="17" width="2" height="3" />
    </svg>
  </IconCircle>
);
const PollsIcon = () => (
  <IconCircle bg="#f59e0b">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><rect x="4" y="6" width="12" height="3" rx="1.5" /><rect x="4" y="11" width="16" height="3" rx="1.5" /><rect x="4" y="16" width="9" height="3" rx="1.5" /></svg>
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

const MAX_AUDIO_SECONDS = 300; // 5-minute soft cap — audio is tiny, this is just a guard

/** Record a voice message, preview it, then stage it to send. Bottom sheet. */
function AudioRecorder({ onCancel, onDone }: { onCancel: () => void; onDone: (file: File) => void }) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'ready' | 'error'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<File | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function stopStream() { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; }

  // Clean up the stream, timer, and preview URL on unmount.
  useEffect(() => () => { stopTimer(); stopStream(); if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function pickMime(): string {
    const opts = ['audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const t of opts) { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) return t; }
    return '';
  }

  async function start() {
    setErrMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        fileRef.current = new File([blob], `voice-${Date.now()}.${ext}`, { type });
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase('ready');
        stopStream();
      };
      rec.start();
      recorderRef.current = rec;
      setSeconds(0);
      setPhase('recording');
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_AUDIO_SECONDS) stop();
          return next;
        });
      }, 1000);
    } catch {
      setErrMsg('Microphone access was blocked. Allow the microphone in your settings to record a voice message.');
      setPhase('error');
    }
  }

  function stop() {
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    fileRef.current = null;
    setSeconds(0);
    setPhase('idle');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
        <h3 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>🎙️ Voice message</h3>

        {phase === 'error' && <p className="mt-3 text-sm text-red-600">{errMsg}</p>}

        {phase === 'idle' && (
          <p className="mt-2 text-sm text-gray-500">Tap record and speak. You can listen back before sending.</p>
        )}

        {phase === 'recording' && (
          <div className="mt-4 flex items-center justify-center gap-2 text-2xl font-semibold tabular-nums" style={{ color: 'var(--th-heading)' }}>
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-500" aria-hidden />
            {fmtDuration(seconds)}
          </div>
        )}

        {phase === 'ready' && previewUrl && (
          <div className="mt-4">
            <audio src={previewUrl} controls className="w-full" />
            <p className="mt-1 text-center text-xs text-gray-400">{fmtDuration(seconds)}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {(phase === 'idle' || phase === 'error') && (
            <button type="button" onClick={start} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>● Record</button>
          )}
          {phase === 'recording' && (
            <button type="button" onClick={stop} className="rounded-full bg-red-500 px-5 py-2.5 text-sm font-semibold text-white">■ Stop</button>
          )}
          {phase === 'ready' && (
            <>
              <button type="button" onClick={() => fileRef.current && onDone(fileRef.current)} className="rounded-full px-5 py-2.5 text-sm font-semibold" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Add</button>
              <button type="button" onClick={reset} className="rounded-full border px-5 py-2.5 text-sm" style={{ borderColor: 'var(--th-hairline-strong)' }}>Re-record</button>
            </>
          )}
          <button type="button" onClick={onCancel} className="rounded-full px-5 py-2.5 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** Confirm before deleting a message (so a stray tap can't wipe one out). */
function ConfirmDelete({ deleting, onConfirm, onCancel }: { deleting: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
        <h3 className="text-lg font-bold" style={{ color: 'var(--th-heading)' }}>Delete this message?</h3>
        <p className="mt-1 text-sm text-gray-500">It will be removed for everyone. This can&apos;t be undone.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onConfirm} disabled={deleting} className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#dc2626' }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-full px-5 py-2.5 text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** A small × in the top outer corner of a message → confirm → delete. Sits on
 *  the left for your own (right-aligned) bubbles, the right for others'. */
function DeleteDot({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label="Delete message"
      className={`absolute -top-2 ${side === 'left' ? '-left-2' : '-right-2'} z-10 flex h-5 w-5 items-center justify-center rounded-full text-[0.7rem] font-bold leading-none text-white shadow`}
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
    >
      ×
    </button>
  );
}

function MessageRow({ m, mine, canDelete, reactions, poll, onVote, open, onToggleBar, onReact, onRequestDelete }: {
  m: ChatMessage;
  mine: boolean;
  canDelete: boolean;
  reactions: Map<string, { count: number; mine: boolean }> | undefined;
  poll: PollTally | undefined;
  onVote: (option: number) => void;
  open: boolean;
  onToggleBar: () => void;
  onReact: (emoji: string, wasMine: boolean) => void;
  onRequestDelete: () => void;
}) {
  // A poll renders as a tappable, live-tallied card instead of a chat bubble.
  if (m.poll) {
    const opts = m.poll.options;
    const total = poll?.total ?? 0;
    return (
      <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && m.authorName && <span className="mb-0.5 px-1 text-xs text-gray-500">{m.authorName}</span>}
        <div className="relative w-full max-w-[85%] rounded-2xl border px-3 py-2.5" style={{ borderColor: 'var(--th-hairline-strong)', backgroundColor: 'var(--th-surface)' }}>
          {canDelete && <DeleteDot side={mine ? 'left' : 'right'} onClick={onRequestDelete} />}
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
        {canDelete && <DeleteDot side={mine ? 'left' : 'right'} onClick={onRequestDelete} />}
        {/* Text is natively selectable — long-press (or drag) to select and copy
            any part. A quick tap still opens the emoji-reaction bar. */}
        <div
          onClick={onToggleBar}
          className="whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm"
          style={{
            ...(mine
              ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }
              : { backgroundColor: 'var(--th-hairline)', color: 'var(--th-text)' }),
            WebkitUserSelect: 'text', userSelect: 'text', WebkitTouchCallout: 'default',
          }}
        >
          {m.imageUrl && <img src={m.imageUrl} alt="" className="mb-1 max-h-64 rounded-lg object-cover" />}
          {m.videoUrl && <video src={m.videoUrl} controls playsInline onClick={(e) => e.stopPropagation()} className="mb-1 max-h-64 w-full rounded-lg" />}
          {m.audioUrl && <audio src={m.audioUrl} controls onClick={(e) => e.stopPropagation()} className="mb-1 w-56 max-w-full" />}
          {m.body && linkify(m.body)}
        </div>

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
