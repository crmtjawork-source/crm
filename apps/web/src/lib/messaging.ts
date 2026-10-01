"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Conversation, Message } from "./types";

// Conversations/messages live outside the global store on purpose: message
// history grows without bound, so it's loaded per screen, not preloaded.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastInboundAt?: string): boolean {
  return !!lastInboundAt && Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

function mapConversation(r: Row): Conversation {
  return {
    id: r.id,
    channelId: r.channel_id,
    contactId: r.contact_id,
    lastMessageAt: r.last_message_at ?? undefined,
    lastMessagePreview: r.last_message_preview ?? undefined,
    lastInboundAt: r.last_inbound_at ?? undefined,
    unreadCount: r.unread_count ?? 0,
    createdAt: r.created_at,
  };
}

function mapMessage(r: Row): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    direction: r.direction,
    origin: r.origin ?? undefined,
    type: r.type,
    body: r.body ?? undefined,
    status: r.status,
    error: r.error ?? undefined,
    createdAt: r.created_at,
  };
}

function byLastMessageDesc(a: Conversation, b: Conversation) {
  return (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt);
}

export function useConversations(orgId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(300)
      .then(({ data }) => {
        if (cancelled) return;
        setConversations((data ?? []).map(mapConversation).sort(byLastMessageDesc));
        setLoading(false);
      });

    const channel = supabase
      .channel(`conversations-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `org_id=eq.${orgId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as Row).id;
          setConversations((list) => list.filter((c) => c.id !== id));
          return;
        }
        const conv = mapConversation(payload.new as Row);
        setConversations((list) => [...list.filter((c) => c.id !== conv.id), conv].sort(byLastMessageDesc));
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  const markRead = useCallback(async (conversationId: string) => {
    setConversations((list) => list.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)));
    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
  }, []);

  return { conversations, loading, markRead };
}

function upsertMessage(list: Message[], msg: Message): Message[] {
  return [...list.filter((m) => m.id !== msg.id), msg].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useMessages(conversationId: string | null) {
  // Keyed by conversation so switching threads never flashes the previous
  // thread's messages, without resetting state inside the effect.
  const [loaded, setLoaded] = useState<{ conversationId: string | null; messages: Message[] }>({
    conversationId: null,
    messages: [],
  });

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (cancelled) return;
        setLoaded((prev) => ({
          conversationId,
          // Keep anything realtime delivered while the initial fetch was in flight.
          messages: (prev.conversationId === conversationId ? prev.messages : []).reduce(
            upsertMessage,
            (data ?? []).map(mapMessage).reverse()
          ),
        }));
      });

    const upsert = (row: Row) => {
      const msg = mapMessage(row);
      setLoaded((prev) => ({
        conversationId,
        messages: upsertMessage(prev.conversationId === conversationId ? prev.messages : [], msg),
      }));
    };
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => upsert(payload.new as Row)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => upsert(payload.new as Row)
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Optimistic insert after a successful send; realtime delivers the same row
  // again and the id-dedupe absorbs it.
  const addLocal = useCallback(
    (row: Row) => {
      const msg = mapMessage(row);
      setLoaded((prev) =>
        prev.conversationId === conversationId ? { ...prev, messages: upsertMessage(prev.messages, msg) } : prev
      );
    },
    [conversationId]
  );

  const current = loaded.conversationId === conversationId;
  return {
    messages: current ? loaded.messages : [],
    loading: !!conversationId && !current,
    addLocal,
  };
}
