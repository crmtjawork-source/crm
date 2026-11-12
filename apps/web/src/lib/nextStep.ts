import type { Contact, Opportunity } from "@/lib/types";

// What the person looking at a lead should probably do next, from facts already on the lead.
export type NextStepAction = "whatsapp" | "call" | "meeting" | "afterMeeting";
export type NextStep = { title: string; detail: string; tone: "info" | "warn" | "urgent"; action?: NextStepAction; actionLabel?: string };

const DAY = 86400000;
const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : 0);

export function nextStepFor({ contact, deal, stageName }: { contact: Contact; deal?: Opportunity; stageName?: string }): NextStep | null {
  if (deal && deal.status !== "open") return null;
  const status = contact.handlingStatus ?? "";
  const stage = stageName ?? "";
  const attempts = contact.noAnswerCount ?? 0;
  const quiet = daysSince(contact.lastActivityAt);
  const inStage = deal ? daysSince(deal.stageChangedAt) : 0;
  const hasPhone = Boolean(contact.phone);

  if (!contact.ownerEmail)
    return { title: "הליד עדיין לא משויך", detail: "שייכו אותו לנציג בשורת “בעלים” למטה, כדי שמישהו יטפל בו.", tone: "warn" };

  if (attempts >= 3)
    return { title: `${attempts} ניסיונות ללא מענה`, detail: "שווה לנסות בוואטסאפ, ואם אין תגובה, לשקול לסגור כלא רלוונטי.", tone: "urgent", action: hasPhone ? "whatsapp" : undefined, actionLabel: "וואטסאפ" };
  if (attempts > 0 || /ללא מענה/.test(status))
    return { title: attempts ? `${attempts} ניסיונות ללא מענה` : "הליד לא ענה", detail: "הודעה קצרה בוואטסאפ עוזרת יותר מעוד שיחה.", tone: "warn", action: hasPhone ? "whatsapp" : undefined, actionLabel: "וואטסאפ" };

  if (/פגישה/.test(stage) && inStage >= 1)
    return { title: "הייתה פגישה? לסכם אותה", detail: "תיעוד קצר אחרי הפגישה והעברה לשלב הבא.", tone: "info", action: "afterMeeting", actionLabel: "אחרי פגישה" };

  if (/הצעה/.test(stage) && inStage >= 2)
    return { title: `ההצעה בשלב ${inStage} ימים`, detail: "זה הזמן למעקב: לשאול אם ראו אותה ומה חשבו.", tone: "warn", action: hasPhone ? "whatsapp" : undefined, actionLabel: "וואטסאפ" };

  if (daysSince(contact.createdAt) < 1 && !contact.lastActivityAt)
    return { title: "ליד חדש. ליצור קשר ראשון", detail: "ככל שמגיבים מהר יותר, כך קל יותר לסגור.", tone: "info", action: hasPhone ? "call" : undefined, actionLabel: "התקשרות" };

  if (quiet >= 3)
    return { title: `אין קשר ${quiet} ימים`, detail: "לחזור אל הליד לפני שהוא מתקרר.", tone: quiet >= 7 ? "urgent" : "warn", action: hasPhone ? "whatsapp" : undefined, actionLabel: "וואטסאפ" };

  return null;
}
