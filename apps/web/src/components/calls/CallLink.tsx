"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { dialHref } from "@/lib/calls";
import type { Contact } from "@/lib/types";
import { useCalls } from "./CallProvider";

// A phone link that dials like tel: and also logs the attempt, so the agent is
// asked how the call went when they come back. The native navigation is left
// alone (phones only open the dialer from the tap itself).
export function CallLink({ contact, children, onClick, ...rest }: { contact: Contact; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { startCall } = useCalls();
  if (!contact.phone) return <span className={rest.className}>{children}</span>;
  return (
    <a
      {...rest}
      href={dialHref(contact.phone)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        startCall(contact);
      }}
    >
      {children}
    </a>
  );
}
