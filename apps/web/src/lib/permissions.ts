import type { Member, Role } from "./types";

// Menu screens a role can show or hide (leads are governed by the lead scope).
export const FEATURES: { id: string; href: string; label: string }[] = [
  { id: "dashboard", href: "/dashboard", label: "לוח בקרה" },
  { id: "inbox", href: "/inbox", label: "וואטסאפ חברה" },
  { id: "pipeline", href: "/pipeline", label: "פייפליין" },
  { id: "documents", href: "/documents", label: "הצעות והסכמים" },
  { id: "campaigns", href: "/campaigns", label: "קמפיינים" },
  { id: "calendar", href: "/calendar", label: "יומן" },
  { id: "automations", href: "/automations", label: "אוטומציות" },
  { id: "forms", href: "/forms", label: "טפסים" },
  { id: "tasks", href: "/tasks", label: "משימות" },
  { id: "team", href: "/team", label: "צוות" },
  { id: "settings", href: "/settings", label: "הגדרות העסק" },
];

export const LEAD_SCOPES: { id: Role["leadsScope"]; label: string }[] = [
  { id: "all", label: "כל הלידים" },
  { id: "own_unassigned", label: "הלידים שלו + לידים שלא שויכו" },
  { id: "own", label: "רק הלידים שלו" },
  { id: "none", label: "ללא גישה ללידים" },
];

export const OBJECT_ACCESS: { id: "all" | "own" | "none"; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "own", label: "רק שלו" },
  { id: "none", label: "ללא גישה" },
];

// The custom role in effect for a member (owners and admins: none — full access).
export function effectiveRole(member: Member | undefined, roles: Role[]): Role | undefined {
  if (!member || member.role === "owner" || member.role === "admin") return undefined;
  return roles.find((r) => r.id === member.roleId);
}

export function canSeeHref(role: Role | undefined, href: string): boolean {
  if (!role) return true;
  // Everyone has personal settings (their WhatsApp, notifications); the page
  // hides the business's settings from roles without them.
  if (href === "/settings" || href === "/my-whatsapp") return true;
  if (href === "/contacts") return role.leadsScope !== "none";
  if (href.startsWith("/o/")) return role.objectAccess[href.slice(3)] !== "none";
  const feature = FEATURES.find((f) => f.href === href);
  return !feature || !role.features || role.features.includes(feature.id);
}

// The menu screen a URL belongs to ("/o/<type>/<record>" → "/o/<type>",
// "/contacts/123" → "/contacts").
export function screenOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "o" && parts[1]) return `/o/${parts[1]}`;
  return `/${parts[0] ?? ""}`;
}
