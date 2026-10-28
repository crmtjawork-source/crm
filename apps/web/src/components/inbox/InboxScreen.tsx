"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";
import { apiPost, ApiError } from "@/lib/api";
import { isWindowOpen, useConversations, useMessages } from "@/lib/messaging";
import type { Channel, Contact, Conversation } from "@/lib/types";
import { MessageBubble } from "@/components/inbox/MessageBubble";
import { TemplateForm, type TemplateInput } from "@/components/inbox/TemplateForm";
import { ConnectForm, Connected, LinkControls } from "@/components/settings/PersonalWhatsAppSettings";

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

const AVATAR_COLORS = ["#2563eb", "#db2777", "#16a34a", "#ca8a04", "#7c3aed", "#0891b2", "#ea580c", "#4f46e5", "#0d9488", "#be123c"];

// What to call a chat: the lead's name, else the name WhatsApp shows, else the number / "group".
function chatTitle(c: Conversation, contactsById: Map<string, Contact>): string {
  const lead = c.contactId ? contactsById.get(c.contactId) : undefined;
  if (lead) return lead.name;
  if (c.chatName) return c.chatName;
  return c.isGroup ? "קבוצה" : `+${c.externalThreadId}`;
}

function Avatar({ title, group, size = 40 }: { title: string; group: boolean; size?: number }) {
  const color = AVATAR_COLORS[[...title].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const initials = title.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className="shrink-0 rounded-full flex items-center justify-center text-white font-medium" style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.38 }}>
      {group ? "👥" : initials || "#"}
    </span>
  );
}

type ListTab = "all" | "unread" | "groups" | "leads";

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
  const [tab, setTab] = useState<ListTab>("all");
  const [channelFilter, setChannelFilter] = useState("");
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const unreadTotal = conversations.filter((c) => c.unreadCount > 0).length;
  const visible = conversations.filter((c) => {
    if (channelFilter && c.channelId !== channelFilter) return false;
    if (tab === "unread" && !c.unreadCount) return false;
    if (tab === "groups" && !c.isGroup) return false;
    if (tab === "leads" && !c.contactId) return false;
    if (!needle) return true;
    const lead = c.contactId ? contactsById.get(c.contactId) : undefined;
    return (
      chatTitle(c, contactsById).toLowerCase().includes(needle) ||
      (digits.length >= 3 && (c.externalThreadId.includes(digits) || (lead?.phone ?? "").replace(/\D/g, "").includes(digits))) ||
      c.lastMessagePreview?.toLowerCase().includes(needle)
    );
  });
  const tabBtn = (id: ListTab, label: string) => (
    <button key={id} onClick={() => setTab(id)} className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap ${tab === id ? "bg-emerald-600 text-white" : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300"}`}>
      {label}
    </button>
  );

  return (
    <div className="w-full md:w-96 shrink-0 border-e border-neutral-200 dark:border-neutral-800 flex flex-col min-h-0">
      <div className="p-3 space-y-2 border-b border-neutral-200 dark:border-neutral-800">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש שיחה, שם או מספר…"
          className="w-full px-3 py-1.5 text-sm rounded-full border border-neutral-200 dark:border-neutral-800 bg-transparent"
        />
        <div className="flex gap-1.5 overflow-x-auto">
          {tabBtn("all", "הכל")}
          {tabBtn("unread", unreadTotal ? `לא נקראו (${unreadTotal})` : "לא נקראו")}
          {tabBtn("groups", "קבוצות")}
          {tabBtn("leads", "לידים")}
        </div>
        {channelsById.size > 1 && (
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          >
            <option value="">כל המספרים</option>
            {[...channelsById.values()].map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.displayPhone ? `${ch.name} (+${ch.displayPhone})` : ch.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto">
        {visible.map((c) => {
          const title = chatTitle(c, contactsById);
          const channel = channelsById.get(c.channelId);
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={`w-full text-start px-3 py-2.5 border-b border-neutral-100 dark:border-neutral-900 flex items-center gap-3 ${
                  selectedId === c.id ? "bg-neutral-100 dark:bg-neutral-900" : "hover:bg-neutral-50 dark:hover:bg-neutral-950"
                }`}
              >
                <Avatar title={title} group={c.isGroup} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${c.unreadCount ? "font-semibold" : "font-medium"}`}>
                      {title}
                      {c.contactId && <span className="ms-1.5 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 align-middle">ליד</span>}
                    </span>
                    <span className={`text-[11px] shrink-0 ${c.unreadCount ? "text-emerald-600 font-medium" : "text-neutral-400"}`}>{formatListTime(c.lastMessageAt)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-neutral-500 truncate">{c.lastMessagePreview ?? ""}</span>
                    {c.unreadCount > 0 && <span className="text-[11px] min-w-[1.25rem] text-center px-1 rounded-full bg-emerald-500 text-white shrink-0">{c.unreadCount}</span>}
                  </span>
                  {channelsById.size > 1 && channel && <span className="block text-[11px] text-neutral-400 mt-0.5">{channel.name}</span>}
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <p className="text-sm text-neutral-400 p-4">אין שיחות.</p>}
      </ul>
    </div>
  );
}

// Phone: the list and the open conversation take turns; this returns to the list.
function BackToList({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="חזרה לרשימת השיחות" className="md:hidden shrink-0 -ms-1 p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "היום";
  if (d.toDateString() === yesterday.toDateString()) return "אתמול";
  return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};

function mediaTypeOf(file: File): "image" | "video" | "voice" | "document" {
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml") return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "voice";
  return "document";
}

function Thread({
  conversation,
  contact,
  channel,
  title,
  onBack,
}: {
  onBack: () => void;
  conversation: Conversation;
  contact?: Contact;
  channel?: Channel;
  title: string;
}) {
  const { messages, loading, addLocal } = useMessages(conversation.id);
  const { uploadMedia, addContact } = useStore();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // A linked WhatsApp (gateway) has no 24-hour rule — only Meta's official API does.
  const windowOpen = isGateway(channel) || isWindowOpen(conversation.lastInboundAt);
  const canAttach = channel?.provider === "evolution";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, conversation.id]);

  async function send(payload: { text?: string; template?: TemplateInput; media?: { url: string; mediaType: string; fileName?: string; caption?: string } }) {
    setBusy(true);
    setError(null);
    try {
      const { message } = await apiPost<{ message: Row }>("/api/messages/send", { conversationId: conversation.id, ...payload });
      addLocal(message);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השליחה נכשלה");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (file) {
      setBusy(true);
      setError(null);
      try {
        const url = await uploadMedia(file);
        const ok = await send({ media: { url, mediaType: mediaTypeOf(file), fileName: file.name, caption: text.trim() || undefined } });
        if (ok) {
          setFile(null);
          setText("");
        }
      } catch {
        setError("העלאת הקובץ נכשלה");
        setBusy(false);
      }
      return;
    }
    if (!text.trim()) return;
    if (await send({ text: text.trim() })) setText("");
  }

  // A chat with someone who isn't a lead yet: make them a lead and link the chat.
  async function makeLead() {
    if (conversation.isGroup || contact) return;
    setBusy(true);
    try {
      const created = await addContact({ name: conversation.chatName ?? `+${conversation.externalThreadId}`, phone: conversation.externalThreadId, source: "וואטסאפ" });
      await supabase.from("conversations").update({ contact_id: created.id }).eq("id", conversation.id);
    } catch {
      setError("יצירת הליד נכשלה");
    }
    setBusy(false);
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-neutral-50 dark:bg-neutral-950">
      <div className="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-white dark:bg-neutral-950">
        <BackToList onClick={onBack} />
        <Avatar title={title} group={conversation.isGroup} size={36} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{title}</p>
          <p className="text-xs text-neutral-500 truncate">
            {conversation.isGroup ? "קבוצה" : <span dir="ltr">+{conversation.externalThreadId}</span>}
            {channel && <> · דרך {channel.name}</>}
          </p>
        </div>
        {contact ? (
          <Link href={`/contacts/${contact.id}`} className="text-xs text-neutral-500 hover:underline shrink-0">
            כרטיס ליד
          </Link>
        ) : (
          !conversation.isGroup && (
            <button onClick={makeLead} disabled={busy} className="text-xs px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900 shrink-0 disabled:opacity-50">
              הפוך לליד
            </button>
          )
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {loading && <p className="text-sm text-neutral-400">טוען הודעות…</p>}
        {!loading && messages.length === 0 && <p className="text-sm text-neutral-400">אין עדיין הודעות בשיחה הזו.</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const day = dayLabel(m.createdAt);
          const sep = !prev || dayLabel(prev.createdAt) !== day;
          return (
            <div key={m.id} className={!sep && prev && prev.direction === m.direction && prev.senderName === m.senderName ? "" : "pt-1.5"}>
              {sep && (
                <div className="flex justify-center my-2">
                  <span className="text-[11px] px-3 py-1 rounded-full bg-neutral-200/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">{day}</span>
                </div>
              )}
              <MessageBubble message={m} showSender={conversation.isGroup && (!prev || prev.senderName !== m.senderName || prev.direction !== m.direction || sep)} />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 space-y-2 bg-white dark:bg-neutral-950">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {file && (
          <div className="flex items-center gap-2 text-xs rounded-md bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5">
            <span>📎</span>
            <span className="flex-1 truncate">{file.name}</span>
            <button onClick={() => setFile(null)} className="text-neutral-400 hover:text-red-500" aria-label="הסרת הקובץ">
              ×
            </button>
          </div>
        )}
        {windowOpen ? (
          <form onSubmit={handleSend} className="flex gap-2 items-end">
            {canAttach && (
              <>
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => (setFile(e.target.files?.[0] ?? null), (e.target.value = ""))} />
                <button type="button" onClick={() => fileRef.current?.click()} className="w-9 h-9 shrink-0 rounded-full border border-neutral-200 dark:border-neutral-700 text-lg hover:bg-neutral-100 dark:hover:bg-neutral-900" aria-label="צירוף קובץ או תמונה" title="צירוף קובץ או תמונה">
                  📎
                </button>
              </>
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              dir="auto"
              placeholder={file ? "כיתוב (לא חובה)…" : "כתיבת הודעה…"}
              className="flex-1 resize-none px-3 py-2 text-sm rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-transparent max-h-32"
            />
            <button type="submit" disabled={busy || (!text.trim() && !file)} className="px-4 py-2 text-sm rounded-full bg-emerald-600 text-white disabled:opacity-50">
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

// Linked WhatsApp numbers (Green-API / our Evolution server) send freely;
// Meta's official API needs approved templates outside the 24-hour window.
const isGateway = (channel?: Channel) => Boolean(channel && channel.provider !== "whatsapp_cloud");

function StartConversation({ contact, channels, basePath, onBack }: { contact: Contact; channels: Channel[]; basePath: string; onBack: () => void }) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(channels.find((c) => c.isDefault)?.id ?? channels[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const gateway = isGateway(channels.find((c) => c.id === channelId));

  async function handleSend(template?: TemplateInput) {
    setBusy(true);
    setError(null);
    try {
      const { message } = await apiPost<{ message: Row }>("/api/messages/send", { contactId: contact.id, channelId, ...(template ? { template } : { text }) });
      router.replace(`${basePath}?c=${message.conversation_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "השליחה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 p-6 max-w-lg space-y-4">
      <div>
        <BackToList onClick={onBack} />
        <h2 className="font-semibold">שיחה חדשה עם {contact.name}</h2>
        <p className="text-sm text-neutral-500" dir="ltr">
          {contact.phone ?? "אין מספר טלפון"}
        </p>
      </div>
      {!contact.phone ? (
        <p className="text-sm text-red-500">לליד הזה אין מספר טלפון — צריך להוסיף אחד בכרטיס הליד.</p>
      ) : (
        <>
          {!gateway && (
            <p className="text-sm text-neutral-500">
              במספר הרשמי של וואטסאפ, פתיחת שיחה יזומה אפשרית רק עם תבנית שאושרה על ידי מטא (WhatsApp Manager ← Message templates).
            </p>
          )}
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
          {gateway ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) handleSend();
              }}
              className="space-y-2"
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                dir="auto"
                placeholder="כתיבת הודעה…"
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
              <button type="submit" disabled={busy || !text.trim()} className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white disabled:opacity-50">
                {busy ? "שולח…" : "שליחה"}
              </button>
            </form>
          ) : (
            <TemplateForm submitLabel="שליחת תבנית ופתיחת שיחה" busy={busy} onSubmit={handleSend} />
          )}
        </>
      )}
    </div>
  );
}

// box: "business" = the business's numbers (shared WhatsApp, official API);
// "personal" = the signed-in member's own linked WhatsApp. Personal chats are
// private to their owner — managers don't see a colleague's.
function InboxView({ box, basePath }: { box: "business" | "personal"; basePath: string }) {
  const { membership } = useAuth();
  const { contacts, channels, members, currentMemberId, reloadIntegrations } = useStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { conversations, loading, markRead } = useConversations(membership!.orgId);
  const me = members.find((m) => m.id === currentMemberId);
  const isAdmin = me?.role !== "agent";
  const viewing = currentMemberId;

  const gateway = (c: Channel) => c.provider === "green_api" || c.provider === "evolution";
  const boxChannels = useMemo(
    () =>
      box === "business"
        ? channels.filter((c) => !c.ownerMembershipId)
        : channels.filter((c) => gateway(c) && `mem:${c.ownerMembershipId}` === viewing),
    [channels, box, viewing]
  );
  const myPersonal = channels.find((c) => gateway(c) && c.active && `mem:${c.ownerMembershipId}` === currentMemberId);
  const boxIds = useMemo(() => new Set(boxChannels.map((c) => c.id)), [boxChannels]);
  const boxConversations = useMemo(() => conversations.filter((c) => boxIds.has(c.channelId)), [conversations, boxIds]);

  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const activeChannels = useMemo(() => boxChannels.filter((c) => c.active), [boxChannels]);
  const channelsById = useMemo(() => new Map(boxChannels.map((c) => [c.id, c])), [boxChannels]);

  const conversationParam = searchParams.get("c");
  const contactParam = searchParams.get("contact");
  const contactConversation = contactParam ? boxConversations.find((c) => c.contactId === contactParam && !c.isGroup) : undefined;
  const selectedId = conversationParam ?? contactConversation?.id ?? null;
  const selected = boxConversations.find((c) => c.id === selectedId);

  useEffect(() => {
    if (selected && selected.unreadCount > 0) markRead(selected.id);
  }, [selected, markRead]);

  // A linked number can be logged out from the phone at any time; refresh the
  // channel status when the page opens and when the tab regains focus, so a
  // disconnected number shows the link screen instead of an empty inbox.
  useEffect(() => {
    void reloadIntegrations();
    const onFocus = () => void reloadIntegrations();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadIntegrations]);

  // Numbers linked before the full-sync update get the new settings (groups,
  // all events) once per session — the WhatsApp session itself is untouched.
  useEffect(() => {
    for (const c of boxChannels) {
      if (c.provider !== "evolution" || !c.active) continue;
      const key = `crm-wa-configured:${c.id}`;
      try {
        if (sessionStorage.getItem(key)) continue;
        sessionStorage.setItem(key, "1");
      } catch {
        // no storage: configure on every load, harmless
      }
      void apiPost("/api/channels/gateway", { action: "configure", id: c.id }).catch(() => undefined);
    }
  }, [boxChannels]);

  const title = box === "business" ? "וואטסאפ חברה" : "וואטסאפ אישי";

  // My own number: link it right here.
  if (box === "personal" && viewing === currentMemberId && (!myPersonal || myPersonal.status !== "authorized")) {
    return (
      <div className="p-6 max-w-md space-y-3">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          מחברים את הוואטסאפ האישי שלך (סריקת קוד, כמו וואטסאפ ווב), וכל השיחות שלך מופיעות כאן: שיחות רגילות, קבוצות ותמונות, כולל 30
          הימים האחרונים. השיחות פרטיות — רק אתה רואה אותן.
        </p>
        {myPersonal ? <Connected channel={myPersonal} onChange={reloadIntegrations} /> : <ConnectForm onDone={reloadIntegrations} />}
      </div>
    );
  }

  if (box === "business" && activeChannels.length === 0) {
    return (
      <div className="p-6 max-w-md">
        <h1 className="text-xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-neutral-500">
          {isAdmin ? (
            <>
              עוד לא מחובר מספר עסקי. מחברים אותו ב
              <Link href="/settings/integrations" className="underline mx-1">
                הגדרות ← מספר העסק
              </Link>
              ואז כל השיחות שלו יופיעו כאן.
            </>
          ) : (
            "מנהל עוד לא חיבר את מספר העסק."
          )}
        </p>
      </div>
    );
  }

  const startContact = contactParam && !contactConversation && !loading ? contactsById.get(contactParam) : undefined;

  return (
    <div className="flex h-[calc(100dvh-3rem)]">
      <div className={`${selected || startContact ? "hidden md:flex" : "flex"} flex-col min-h-0 w-full md:w-auto`}>
        {box === "personal" && myPersonal && (
          <div className="md:w-96 border-e border-neutral-200 dark:border-neutral-800">
            <LinkControls channel={myPersonal} onChange={reloadIntegrations} />
          </div>
        )}
        <ConversationList
          conversations={boxConversations}
          contactsById={contactsById}
          channelsById={channelsById}
          selectedId={selectedId}
          onSelect={(id) => router.replace(`${basePath}?c=${id}`)}
        />
      </div>
      {selected ? (
        <Thread key={selected.id} onBack={() => (contactParam ? router.back() : router.replace(basePath))} conversation={selected} contact={selected.contactId ? contactsById.get(selected.contactId) : undefined} channel={channelsById.get(selected.channelId)} title={chatTitle(selected, contactsById)} />
      ) : startContact ? (
        <StartConversation contact={startContact} channels={activeChannels} basePath={basePath} onBack={() => router.back()} />
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-sm text-neutral-400">{loading ? "טוען שיחות…" : "בחרו שיחה מהרשימה"}</div>
      )}
    </div>
  );
}

export function InboxScreen({ box, basePath }: { box: "business" | "personal"; basePath: string }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-400">טוען…</div>}>
      <InboxView box={box} basePath={basePath} />
    </Suspense>
  );
}
