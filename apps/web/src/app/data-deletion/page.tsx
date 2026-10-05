import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = { title: "בקשה למחיקת מידע | אינווסטד נדל״ן" };

const SECTIONS: LegalSection[] = [
  {
    title: "איזה מידע נשמר",
    paragraphs: [
      "כשמשאירים פרטים בטופס לידים של Facebook / Instagram, באתר או בפנייה ב-WhatsApp, נשמרים במערכת ה-CRM של החברה הפרטים שמסרת (שם, טלפון, אימייל, תשובות הטופס), תיעוד השיחות והפגישות, ותוכן הודעות ה-WhatsApp שהוחלפו איתך.",
    ],
  },
  {
    title: "איך מבקשים למחוק את המידע",
    paragraphs: ["אפשר לבקש מחיקה בכל אחת מהדרכים הבאות:"],
    items: [
      'שליחת אימייל ל-info@investedgroup.co.il עם הנושא "בקשה למחיקת מידע", ובו השם ומספר הטלפון שאיתם השארת פרטים.',
      'שליחת הודעת WhatsApp למספר שממנו פנינו אליך, עם הבקשה "מחקו את המידע שלי".',
    ],
  },
  {
    title: "מה קורה אחרי הבקשה",
    items: [
      "נאשר את קבלת הבקשה ונוודא שהיא הגיעה ממך.",
      "תוך 30 יום נמחק את הרשומה שלך ממערכת ה-CRM, כולל ההודעות, ההערות והפגישות הקשורות אליה, ונעדכן אותך שהמחיקה בוצעה.",
      "מידע שהחוק מחייב אותנו לשמור (למשל מסמכים חשבונאיים של עסקה שבוצעה) יישמר רק למשך התקופה הנדרשת.",
    ],
  },
  {
    title: "מידע שנמצא אצל Meta",
    paragraphs: [
      "מחיקה אצלנו אינה מוחקת מידע שנשמר בחשבון ה-Facebook, Instagram או WhatsApp שלך. לניהול המידע הזה יש לפנות להגדרות הפרטיות של Meta.",
    ],
  },
];

export default function DataDeletionPage() {
  return <LegalPage title="בקשה למחיקת מידע" updated="אוקטובר 2026" sections={SECTIONS} />;
}
