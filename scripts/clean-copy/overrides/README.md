# CRM

מערכת CRM כללית (SaaS מרובת ארגונים) לכל סוג עסק: לידים, פייפליין, אוטומציות, WhatsApp, מסמכים לחתימה, טבלאות מותאמות ועוד.

## מבנה

```
apps/web               אפליקציית Next.js 16 (App Router, TypeScript, Tailwind, RTL) — PWA
packages/db            סכמת Drizzle (תיעוד/טיפוסים; מקור האמת בפועל הוא ה-SQL)
supabase/migrations    מיגרציות SQL (טבלאות, RLS, פונקציות, טריגרים) — רצות לפי הסדר
scripts/               סקריפטים: הקמת סביבה, וייבוא מ-Fireberry (דוגמה)
docs/                  תיעוד
```

## להתחלה

- [`docs/HANDOVER.md`](docs/HANDOVER.md) — מסמך מסירה מלא: מה המוצר, פיצ'רים, ארכיטקטורה, מודל נתונים, הרשאות, אוטומציות, פערים.
- [`docs/SETUP.md`](docs/SETUP.md) — הקמת סביבה נקייה מאפס (Supabase, משתני סביבה, Vercel, ארגון ובעלים ראשונים).

```bash
npm install
npm run dev
```
