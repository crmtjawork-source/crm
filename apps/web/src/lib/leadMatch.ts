import { normalizePhone } from "@/lib/phone";
import type { Contact, Conversation } from "@/lib/types";

// A chat whose number matches a lead's phone belongs to that lead, even when
// the conversation row was never linked to it.
export function linkChatsToLeads(conversations: Conversation[], contacts: Contact[]): Conversation[] {
  const byPhone = new Map<string, Contact>();
  for (const c of contacts) {
    const p = normalizePhone(c.phone);
    if (p && !byPhone.has(p)) byPhone.set(p, c);
  }
  return conversations.map((c) => {
    if (c.contactId || c.isGroup || c.externalThreadId.includes("@")) return c;
    const lead = byPhone.get(normalizePhone(c.externalThreadId) ?? "");
    return lead ? { ...c, contactId: lead.id } : c;
  });
}
