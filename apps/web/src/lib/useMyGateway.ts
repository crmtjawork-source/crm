"use client";

import { useStore } from "./store";

// The signed-in member's linked personal WhatsApp, if connected.
export function useMyGateway() {
  const { channels, currentMemberId } = useStore();
  const channel = channels.find((c) => (c.provider === "green_api" || c.provider === "evolution") && c.active && `mem:${c.ownerMembershipId}` === currentMemberId);
  return { channel, ready: channel?.status === "authorized" };
}

// Everything the signed-in member can send from right now: their own
// WhatsApp and the business's shared number(s).
export function useSendChannels() {
  const { channels, currentMemberId } = useStore();
  const linked = channels.filter((c) => (c.provider === "green_api" || c.provider === "evolution") && c.active && c.status === "authorized");
  const mine = linked.find((c) => `mem:${c.ownerMembershipId}` === currentMemberId);
  const business = linked.filter((c) => !c.ownerMembershipId);
  return { mine, business, all: [...(mine ? [mine] : []), ...business] };
}

// Where "WhatsApp" on a lead leads: the member's own chat with that lead when
// their WhatsApp is linked, else the business number's chat, else the
// personal page (which offers to link it first).
export function useLeadChatHref(contactId: string) {
  const { channels } = useStore();
  const { ready } = useMyGateway();
  const business = channels.some((c) => !c.ownerMembershipId && c.active);
  return `${ready || !business ? "/my-whatsapp" : "/inbox"}?contact=${contactId}`;
}
