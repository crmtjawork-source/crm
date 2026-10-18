"use client";

import { useStore } from "./store";

// The signed-in member's linked personal WhatsApp, if connected.
export function useMyGateway() {
  const { channels, currentMemberId } = useStore();
  const channel = channels.find((c) => c.provider === "green_api" && c.active && `mem:${c.ownerMembershipId}` === currentMemberId);
  return { channel, ready: channel?.status === "authorized" };
}
