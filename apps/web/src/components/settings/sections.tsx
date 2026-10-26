"use client";

import { Suspense, type ReactNode } from "react";
import { PushSettings } from "./PushSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";
import { PersonalWhatsAppSettings } from "./PersonalWhatsAppSettings";
import { ObjectsSettings } from "./ObjectsSettings";
import { LeadFieldsSettings } from "./LeadFieldsSettings";
import { LeadStatusesSettings } from "./LeadStatusesSettings";
import { PipelineStagesSettings } from "./PipelineStagesSettings";
import { MessageTemplatesSettings } from "./MessageTemplatesSettings";
import { DocumentTemplatesSettings } from "./DocumentTemplatesSettings";
import { RolesSettings } from "./RolesSettings";
import { IntegrationsSettings } from "./IntegrationsSettings";

// The settings area: each entry is one page in the settings sidebar.
// `business` sections are only for roles that include "settings".
export type SettingsSection = {
  slug: string;
  label: string;
  group: "אישי" | "נתונים וכרטיסים" | "תקשורת ומסמכים" | "ניהול";
  business: boolean;
  render: (isAdmin: boolean) => ReactNode;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { slug: "appearance", label: "מראה", group: "אישי", business: false, render: () => <AppearanceSettings /> },
  { slug: "notifications", label: "התראות", group: "אישי", business: false, render: () => <PushSettings /> },
  {
    slug: "calendar",
    label: "יומן גוגל",
    group: "אישי",
    business: false,
    render: (isAdmin) => (
      <Suspense>
        <GoogleCalendarSettings isAdmin={isAdmin} />
      </Suspense>
    ),
  },
  { slug: "my-whatsapp", label: "הוואטסאפ שלי", group: "אישי", business: false, render: (a) => <PersonalWhatsAppSettings isAdmin={a} /> },
  { slug: "objects", label: "טבלאות ואובייקטים", group: "נתונים וכרטיסים", business: true, render: (a) => <ObjectsSettings isAdmin={a} /> },
  { slug: "lead-fields", label: "שדות בכרטיס הליד", group: "נתונים וכרטיסים", business: true, render: (a) => <LeadFieldsSettings isAdmin={a} /> },
  { slug: "stages", label: "שלבי עסקה", group: "נתונים וכרטיסים", business: true, render: (a) => <PipelineStagesSettings isAdmin={a} /> },
  { slug: "lead-statuses", label: "סטטוסי ליד", group: "נתונים וכרטיסים", business: true, render: (a) => <LeadStatusesSettings isAdmin={a} /> },
  { slug: "messages", label: "הודעות מוכנות", group: "תקשורת ומסמכים", business: true, render: (a) => <MessageTemplatesSettings isAdmin={a} /> },
  { slug: "documents", label: "הצעות והסכמים", group: "תקשורת ומסמכים", business: true, render: (a) => <DocumentTemplatesSettings isAdmin={a} /> },
  { slug: "integrations", label: "חיבורים וערוצים", group: "תקשורת ומסמכים", business: true, render: () => <IntegrationsSettings /> },
  { slug: "roles", label: "תפקידים והרשאות", group: "ניהול", business: true, render: (a) => <RolesSettings isAdmin={a} /> },
];
