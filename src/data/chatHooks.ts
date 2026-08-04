import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Group chat. A channel is a Roster group; who can see it is enforced by RLS
 * (managers see all, viewers see the groups they're assigned to). Messages and
 * reactions poll on a short interval while the chat is open — near-real-time
 * without the extra moving parts of a realtime socket.
 */

export interface ChatChannel { groupId: string; name: string; parentId: string | null; sort: number; unread: number }
export interface ChatMessage { id: string; groupId: string; userId: string; authorName: string | null; body: string | null; imageUrl: string | null; createdAt: string }
export interface ChatReaction { messageId: string; userId: string; emoji: string }

const KEY = (orgId: string | undefined, ...rest: string[]) => ['chat', orgId, ...rest];

/** Channels the current user can see, with unread counts. */
export function useChatChannels(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEY(orgId, 'channels'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    refetchInterval: 15_000,
    queryFn: async (): Promise<ChatChannel[]> => {
      const s = getSupabase(); if (!s || !orgId) return [];
      const { data, error } = await s.rpc('my_chat_groups', { p_org: orgId });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ groupId: r.group_id, name: r.name, parentId: r.parent_id ?? null, sort: r.sort, unread: r.unread ?? 0 }));
    },
  });
}

export function useChatMessages(orgId: string | undefined, groupId: string | undefined) {
  return useQuery({
    queryKey: KEY(orgId, 'messages', groupId ?? ''),
    enabled: Boolean(orgId) && Boolean(groupId) && isSupabaseConfigured,
    refetchInterval: 4_000,
    queryFn: async (): Promise<ChatMessage[]> => {
      const s = getSupabase(); if (!s || !groupId) return [];
      const { data, error } = await s.from('chat_messages')
        .select('id, group_id, user_id, author_name, body, image_url, created_at')
        .eq('group_id', groupId).order('created_at').limit(500);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: r.id, groupId: r.group_id, userId: r.user_id, authorName: r.author_name ?? null, body: r.body ?? null, imageUrl: r.image_url ?? null, createdAt: r.created_at }));
    },
  });
}

export function useChatReactions(orgId: string | undefined, groupId: string | undefined) {
  return useQuery({
    queryKey: KEY(orgId, 'reactions', groupId ?? ''),
    enabled: Boolean(orgId) && Boolean(groupId) && isSupabaseConfigured,
    refetchInterval: 4_000,
    queryFn: async (): Promise<ChatReaction[]> => {
      const s = getSupabase(); if (!s || !groupId) return [];
      const { data, error } = await s.from('chat_reactions')
        .select('message_id, user_id, emoji').eq('group_id', groupId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ messageId: r.message_id, userId: r.user_id, emoji: r.emoji }));
    },
  });
}

export function useSendChatMessage(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, userId, authorName, body, imageUrl }: { groupId: string; userId: string; authorName: string | null; body?: string; imageUrl?: string | null }): Promise<string | null> => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      const { data, error } = await s.from('chat_messages')
        .insert({ org_id: orgId, group_id: groupId, user_id: userId, author_name: authorName, body: body?.trim() || null, image_url: imageUrl || null })
        .select('id').single();
      if (error) throw error;
      // Best-effort per-group push (don't block the UI on it).
      try {
        const { data: sess } = await s.auth.getSession();
        const token = sess.session?.access_token;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msgId = (data as any)?.id as string | undefined;
        if (token && msgId) {
          const url = typeof window !== 'undefined' ? window.location.pathname : '/';
          void fetch('/api/notify-chat', {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ orgId, groupId, messageId: msgId, url }),
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data as any)?.id ?? null;
      } catch { return null; }
    },
    onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: KEY(orgId, 'messages', v.groupId) }); qc.invalidateQueries({ queryKey: KEY(orgId, 'channels') }); },
  });
}

export function useToggleReaction(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, messageId, userId, emoji, on }: { groupId: string; messageId: string; userId: string; emoji: string; on: boolean }) => {
      const s = getSupabase(); if (!s) throw new Error('Backend not configured.');
      if (on) {
        const { error } = await s.from('chat_reactions').insert({ org_id: orgId, group_id: groupId, message_id: messageId, user_id: userId, emoji });
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      } else {
        const { error } = await s.from('chat_reactions').delete().eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji);
        if (error) throw error;
      }
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: KEY(orgId, 'reactions', v.groupId) }),
  });
}

/** Mark a channel read up to now, so its unread count / badge clears. */
export function useMarkChatRead(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const s = getSupabase(); if (!s) return;
      const { data: sess } = await s.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) return;
      const nowIso = new Date().toISOString();
      const { error } = await s.from('chat_reads').upsert({ org_id: orgId, group_id: groupId, user_id: uid, last_read_at: nowIso });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(orgId, 'channels') }); qc.invalidateQueries({ queryKey: KEY(orgId, 'unread') }); },
  });
}

/** Total unread across the user's channels — drives the bottom-bar badge. */
export function useChatUnreadTotal(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEY(orgId, 'unread'),
    enabled: Boolean(orgId) && enabled && isSupabaseConfigured,
    refetchInterval: 20_000,
    queryFn: async (): Promise<number> => {
      const s = getSupabase(); if (!s || !orgId) return 0;
      const { data, error } = await s.rpc('my_chat_unread_total', { p_org: orgId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });
}

/** The slug of a page that contains a chat block (for the bottom-bar badge). */
export function useChatPageSlug(orgId: string | undefined) {
  return useQuery({
    queryKey: KEY(orgId, 'chat-page'),
    enabled: Boolean(orgId) && isSupabaseConfigured,
    queryFn: async (): Promise<string | null> => {
      const s = getSupabase(); if (!s || !orgId) return null;
      const { data, error } = await s.from('blocks').select('page_id, pages(slug)').eq('org_id', orgId).eq('type', 'chat').limit(1);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any = data && data[0];
      return row?.pages?.slug ?? null;
    },
  });
}
