import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";

// Generic template. Replace every [bracketed] value with the operating
// business's details. Meta requires this "data deletion instructions" URL
// for apps that use Facebook Login / Lead Ads / WhatsApp.
const COMPANY = "[שם החברה]";
const PRIVACY_EMAIL = "[privacy@example.com]";

export const metadata: Metadata = { title: `בקשה למחיקת מידע | ${COMPANY}` };

const SECTIONS: LegalSection[] = [
  {
    title: "איזה מידע נשמר",
    paragraphs: [
      "כשמשאירים פרטים בטופס לידים של Facebook / Instagram, באתר או בפנייה ב-WhatsApp, נשמרים במערכת ה-CRM של החברה הפרטים שמסרת (שם, טלפון, אימייל, תשובות הטופס), תיעוד השיחות והפגישות, ותוכן הודעות ה-WhatsApp שהוחלפו איתך.",
    ],
  },
  {
    title: "איך מבקשים למחוק את המידע",
    items: [
      `שליחת אימייל ל-${PRIVACY_EMAIL} עם הנושא "בקשה למחיקת מידע", ובו השם ומספר הטלפון שאיתם השארת פרטים.`,
      'שליחת הודעת WhatsApp למספר שממנו פנינו אליך, עם הבקשה "מחקו את המידע שלי".',
    ],
  },
  {
    title: "מה קורה אחרי הבקשה",
    items: [
      "נאשר את קבלת הבקשה ונוודא שהיא הגיעה ממך.",
      "תוך 30 יום נמחק את הרשומה שלך ממערכת ה-CRM, כולל ההודעות, ההערות והפגישות הקשורות אליה, ונעדכן אותך שהמחיקה בוצעה.",
      "מידע שהחוק מחייב לשמור יישמר רק למשך התקופה הנדרשת.",
    ],
  },
  {
    title: "מידע שנמצא אצל Meta",
    paragraphs: ["מחיקה אצלנו אינה מוחקת מידע שנשמר בחשבון ה-Facebook, Instagram או WhatsApp שלך. לניהול המידע הזה יש לפנות להגדרות הפרטיות של Meta."],
  },
];

export default function DataDeletionPage() {
  return <LegalPage title="בקשה למחיקת מידע" updated="[חודש ושנה]" sections={SECTIONS} />;
}
