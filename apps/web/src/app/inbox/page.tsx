"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { apiPost, ApiError } from "@/lib/api";
import { isWindowOpen, useConversations, useMessages } from "@/lib/messaging";
import type { Channel, Contact, Conversation } from "@/lib/types";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import { TemplateForm, type TemplateInput } from "@/components/inbox/TemplateForm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function formatListTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

function ConversationList({
  conversations,
  contactsById,
  channelsById,
  selectedId,
  onSelect,
}: {
  conversations: Conversation[];
  contactsById: Map<string, Contact>;
  channelsById: Map<string, Channel>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const needle = q.trim().toLowerCase();
  const visible = conversations.filter((c) => {
    if (channelFilter && c.channelId !== channelFilter) return false;
    if (!needle) return true;
    const contact = contactsById.get(c.contactId);
    return (
      contact?.name.toLowerCase().includes(needle) ||
      contact?.phone?.includes(needle) ||
      c.lastMessagePreview?.toLowerCase().includes(needle)
    );
  });

  return (
    <div className="w-80 shrink-0 border-e border-neutral-200 dark:border-neutral-800 flex flex-col min-h-0">
      <div className="p-3 space-y-2 border-b border-neutral-200 dark:border-neutral-800">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש שיחה…"
          className="w-full px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        {channelsById.size > 1 && (
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          >
            <option value="">כל המספרים</option>
            {[...channelsById.values()].map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto">
        {visible.map((c) => {
          const contact = contactsById.get(c.contactId);
          const channel = channelsById.get(c.channelId);
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={`w-full text-start px-3 py-2.5 border-b border-neutral-100 dark:border-neutral-900 ${
                  selectedId === c.id ? "bg-neutral-100 dark:bg-neutral-900" : "hover:bg-neutral-50 dark:hover:bg-neutral-950"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${c.unreadCount ? "font-semibold" : "font-medium"}`}>
                    {contact?.name ?? "ליד לא ידוע"}
                  </span>
                  <span className="text-[11px] text-neutral-400 shrink-0">{formatListTime(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-neutral-500 truncate">{c.lastMessagePreview ?? ""}</span>
                  {c.unreadCount > 0 && (
                    <span className="text-[11px] min-w-[1.25rem] text-center px-1 rounded-full bg-emerald-500 text-white shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                {channelsById.size > 1 && channel && <p className="text-[11px] text-neutral-400 mt-0.5">{channel.name}</p>}
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <p className="text-sm text-neutral-400 p-4">אין שיחות.</p>}
      </ul>
    </div>
  );
}

function Thread({
  conversation,
  contact,
  channel,
}: {
  conversation: Conversation;
  contact?: Contact;
  channel?: Channel;
}) {
  const { messages, loading, addLocal } = useMessages(conversation.id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const windowOpen = isWindowOpen(conversation.lastInboundAt);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, conversation.id]);

  async function send(payload: { text?: string; template?: TemplateInput }) {
    setBusy(true);
    setError(null);
    try {
      const { message } = await apiPost<{ message: Row }>("/api/messages/send", { conversationId: conversation.id, ...payload });
      addLocal(message);
      if (payload.text) setText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השליחה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    send({ text: text.trim() });
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{contact?.name ?? "ליד לא ידוע"}</p>
          <p className="text-xs text-neutral-500">
            <span dir="ltr">{contact?.phone ?? ""}</span>
            {channel && <> · דרך {channel.name}</>}
          </p>
        </div>
        {contact && (
          <Link href={`/contacts/${contact.id}`} className="text-xs text-neutral-500 hover:underline shrink-0">
            כרטיס ליד
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && <p className="text-sm text-neutral-400">טוען הודעות…</p>}
        {!loading && messages.length === 0 && <p className="text-sm text-neutral-400">אין עדיין הודעות בשיחה הזו.</p>}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {windowOpen ? (
          <form onSubmit={handleSend} className="flex gap-2 items-end">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              rows={2}
              placeholder="כתיבת הודעה… (Enter לשליחה, Shift+Enter לשורה חדשה)"
              className="flex-1 resize-none px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-50"
            >
              {busy ? "…" : "שליחה"}
            </button>
          </form>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              עברו יותר מ-24 שעות מההודעה האחרונה של הליד (או שהוא עוד לא כתב). וואטסאפ מאפשר כעת רק הודעת תבנית מאושרת.
            </p>
            <TemplateForm submitLabel="שליחת תבנית" busy={busy} onSubmit={(template) => send({ template })} />
          </div>
        )}
      </div>
    </div>
  );
}

function StartConversation({ contact, channels }: { contact: Contact; channels: Channel[] }) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(channels.find((c) => c.isDefault)?.id ?? channels[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(template: TemplateInput) {
    setBusy(true);
    setError(null);
    try {
      const { message } = await apiPost<{ message: Row }>("/api/messages/send", { contactId: contact.id, channelId, template });
      router.replace(`/inbox?c=${message.conversation_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השליחה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 p-6 max-w-lg space-y-4">
      <div>
        <h2 className="font-semibold">שיחה חדשה עם {contact.name}</h2>
        <p className="text-sm text-neutral-500" dir="ltr">
          {contact.phone ?? "אין מספר טלפון"}
        </p>
      </div>
      {!contact.phone ? (
        <p className="text-sm text-red-500">לליד הזה אין מספר טלפון — צריך להוסיף אחד בכרטיס הליד.</p>
      ) : (
        <>
          <p className="text-sm text-neutral-500">
            פתיחת שיחה יזומה בוואטסאפ אפשרית רק עם תבנית שאושרה על ידי מטא (WhatsApp Manager ← Message templates).
          </p>
          {channels.length > 1 && (
            <label className="block text-sm">
              <span className="block text-xs text-neutral-500 mb-1">שליחה מהמספר</span>
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              >
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <TemplateForm submitLabel="שליחת תבנית ופתיחת שיחה" busy={busy} onSubmit={handleSend} />
        </>
      )}
    </div>
  );
}

function InboxView() {
  const { membership } = useAuth();
  const { contacts, channels } = useStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { conversations, loading, markRead } = useConversations(membership!.orgId);

  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const activeChannels = useMemo(() => channels.filter((c) => c.active), [channels]);
  const channelsById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

  const conversationParam = searchParams.get("c");
  const contactParam = searchParams.get("contact");
  const contactConversation = contactParam
    ? conversations.find((c) => c.contactId === contactParam)
    : undefined;
  const selectedId = conversationParam ?? contactConversation?.id ?? null;
  const selected = conversations.find((c) => c.id === selectedId);

  useEffect(() => {
    if (selected && selected.unreadCount > 0) markRead(selected.id);
  }, [selected, markRead]);

  if (activeChannels.length === 0) {
    return (
      <div className="p-6 max-w-md">
        <h1 className="text-xl font-bold mb-2">שיחות</h1>
        <p className="text-sm text-neutral-500">
          עוד לא מחובר אף מספר וואטסאפ. חברו את המספר העסקי ב
          <Link href="/settings" className="underline mx-1">
            הגדרות ← ערוצי וואטסאפ
          </Link>
          ואז כל השיחות יופיעו כאן.
        </p>
      </div>
    );
  }

  const startContact = contactParam && !contactConversation && !loading ? contactsById.get(contactParam) : undefined;

  return (
    <div className="flex h-screen">
      <ConversationList
        conversations={conversations}
        contactsById={contactsById}
        channelsById={channelsById}
        selectedId={selectedId}
        onSelect={(id) => router.replace(`/inbox?c=${id}`)}
      />
      {selected ? (
        <Thread
          key={selected.id}
          conversation={selected}
          contact={contactsById.get(selected.contactId)}
          channel={channelsById.get(selected.channelId)}
        />
      ) : startContact ? (
        <StartConversation contact={startContact} channels={activeChannels} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
          {loading ? "טוען שיחות…" : "בחרו שיחה מהרשימה"}
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-400">טוען…</div>}>
      <InboxView />
    </Suspense>
  );
}
