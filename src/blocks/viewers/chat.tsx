import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { useMembershipRole } from '@/auth/useMembership';
import { useOrganization } from '@/data/hooks';
import {
  useChatChannels, useChatMessages, useChatReactions, useMarkChatRead,
  useSendChatMessage, useToggleReaction,
  type ChatMessage,
} from '@/data/chatHooks';
import { errorMessage } from '@/lib/errors';
import { uploadMedia } from '@/lib/media';
import type { ViewerCtx } from '../actions';

interface ChatProps { title?: string }

const REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

const card = 'rounded-xl border';
const cardStyle = { borderColor: 'rgba(0,0,0,0.12)' } as const;

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
  const [active, setActive] = useState<string | null>(null);
  const markRead = useMarkChatRead(orgId);

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
        <p className="font-semibold" style={{ color: 'var(--th-heading)' }}>💬 {headerName}</p>
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
              style={on ? { backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' } : { border: '1px solid rgba(0,0,0,0.15)' }}
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

function ChannelPane({ orgId, groupId, userId, authorName, onSeen }: { orgId: string; groupId: string; userId: string; authorName: string; onSeen: () => void }) {
  const { data: messages } = useChatMessages(orgId, groupId);
  const { data: reactions } = useChatReactions(orgId, groupId);
  const send = useSendChatMessage(orgId);
  const toggle = useToggleReaction(orgId);

  const [text, setText] = useState('');
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const msgs = useMemo(() => messages ?? [], [messages]);

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
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const m = await uploadMedia(orgId, file);
      await send.mutateAsync({ groupId, userId, authorName, imageUrl: m.url });
    } catch (err) { setError(errorMessage(err)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  function react(messageId: string, emoji: string, mine: boolean) {
    toggle.mutate({ groupId, messageId, userId, emoji, on: !mine });
    setReactingId(null);
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
            open={reactingId === m.id}
            onToggleBar={() => setReactingId((id) => (id === m.id ? null : m.id))}
            onReact={(emoji, wasMine) => react(m.id, emoji, wasMine)}
          />
        ))}
      </div>

      {error && <p className="px-4 text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2 border-t px-3 py-2" style={cardStyle}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="shrink-0 rounded-full px-2 py-2 text-lg disabled:opacity-50" aria-label="Send a photo">{uploading ? '⏳' : '📷'}</button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
        <input
          className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus-visible:ring-2"
          placeholder="Write a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void onSend(); } }}
        />
        <button type="button" onClick={() => void onSend()} disabled={!text.trim() || send.isPending} className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: 'var(--th-primary)', color: 'var(--th-primary-text)' }}>Send</button>
      </div>
    </>
  );
}

function MessageRow({ m, mine, reactions, open, onToggleBar, onReact }: {
  m: ChatMessage;
  mine: boolean;
  reactions: Map<string, { count: number; mine: boolean }> | undefined;
  open: boolean;
  onToggleBar: () => void;
  onReact: (emoji: string, wasMine: boolean) => void;
}) {
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
              : { backgroundColor: 'rgba(0,0,0,0.06)', color: 'var(--th-text)' }}
          >
            {m.imageUrl && <img src={m.imageUrl} alt="" className="mb-1 max-h-64 rounded-lg object-cover" />}
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
              style={{ borderColor: info.mine ? 'var(--th-primary)' : 'rgba(0,0,0,0.15)', backgroundColor: info.mine ? 'color-mix(in srgb, var(--th-primary) 12%, transparent)' : 'transparent' }}
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
