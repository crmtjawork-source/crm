"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { effectiveRole } from "@/lib/permissions";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";

export default function SettingsSectionPage() {
  const { section } = useParams<{ section: string }>();
  const { members, currentMemberId, roles } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const isAdmin = me?.role !== "agent";
  const role = effectiveRole(me, roles);
  const businessSettings = !role || !role.features || role.features.includes("settings");
  const current = SETTINGS_SECTIONS.find((s) => s.slug === section);

  if (!current || (current.business && !businessSettings)) {
    return (
      <p className="text-sm text-neutral-500">
        ההגדרה הזו לא קיימת או שאין לך הרשאה אליה.{" "}
        <Link href="/settings" className="underline">
          חזרה להגדרות
        </Link>
      </p>
    );
  }
  return <>{current.render(isAdmin)}</>;
}
