"use client";

import { Suspense } from "react";
import { useStore } from "@/lib/store";
import { effectiveRole } from "@/lib/permissions";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
import { MessageTemplatesSettings } from "@/components/settings/MessageTemplatesSettings";
import { DocumentTemplatesSettings } from "@/components/settings/DocumentTemplatesSettings";
import { ObjectsSettings } from "@/components/settings/ObjectsSettings";
import { LeadFieldsSettings } from "@/components/settings/LeadFieldsSettings";
import { RolesSettings } from "@/components/settings/RolesSettings";
import { PersonalWhatsAppSettings } from "@/components/settings/PersonalWhatsAppSettings";
import { PushSettings } from "@/components/settings/PushSettings";
import { GoogleCalendarSettings } from "@/components/settings/GoogleCalendarSettings";
import { LeadStatusesSettings } from "@/components/settings/LeadStatusesSettings";

export default function SettingsPage() {
  const { members, currentMemberId, roles } = useStore();
  const me = members.find((m) => m.id === currentMemberId);
  const isAdmin = me?.role !== "agent";
  // Personal settings (my WhatsApp, notifications, calendar) are for everyone;
  // the business's settings only for roles that include them.
  const role = effectiveRole(me, roles);
  const businessSettings = !role || !role.features || role.features.includes("settings");

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-6">הגדרות</h1>
      <PushSettings />
      <Suspense>
        <GoogleCalendarSettings />
      </Suspense>
      <PersonalWhatsAppSettings isAdmin={isAdmin} />
      {businessSettings && (
        <>
          <ObjectsSettings isAdmin={isAdmin} />
          <LeadFieldsSettings isAdmin={isAdmin} />
          <LeadStatusesSettings isAdmin={isAdmin} />
          <MessageTemplatesSettings isAdmin={isAdmin} />
          <DocumentTemplatesSettings isAdmin={isAdmin} />
          <RolesSettings isAdmin={isAdmin} />
          <IntegrationsSettings />
        </>
      )}

    </div>
  );
}
