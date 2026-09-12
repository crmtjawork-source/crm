# crm-app

CRM פנימי שמחליף את More-Than — תוכנית מלאה: [12 שבועות ל-CRM](https://claude.ai/code/artifact/1a8461d8-e010-4204-8217-2ab28c8261d0).

## מבנה

```
apps/web        Next.js 15 (TypeScript, Tailwind, RTL) — ה-PWA
packages/db      סכמת Drizzle, מקור האמת למבנה הטבלאות
supabase/migrations   SQL בפועל (טבלאות + RLS) שרץ על Supabase
```

## מה כבר קיים (שבוע 0, חלק א')

- שלד Next.js רץ, RTL + עברית (Heebo) כברירת מחדל
- סכמת Drizzle + מיגרציית SQL ראשונה: `organizations`, `users`, `memberships`, `invitations` — עם RLS לפי חברות בארגון (התבנית שכל טבלה עתידית תחזור עליה)

## מה עוד צריך כדי להריץ באמת

1. **פרויקט Supabase חדש** (לא Malia — טננט נפרד): `npx supabase login` ואז לחבר, או ליצור ידנית ב-supabase.com ולמלא `DATABASE_URL` + `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` בקובץ `apps/web/.env.local` (לא נשמר ב-git).
2. **להריץ את המיגרציה**: `npx supabase db push` (אחרי חיבור הפרויקט) כדי ליצור את הטבלאות מ-`supabase/migrations/`.
3. **Meta Business Manager** — תהליך אימות נפרד, לא תלוי בקוד. זה צוואר הבקבוק הארוך ביותר בפרויקט כולו — כדאי להתחיל אותו מקביל לכל השאר.

## הרצה מקומית

```bash
npm install
npm run dev
```

נפתח על http://localhost:3000.
