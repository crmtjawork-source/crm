# הקמת סביבה נקייה מאפס

המדריך הזה מקים עותק עצמאי ומלא של ה-CRM: מסד נתונים ריק ב-Supabase, אפליקציה ב-Vercel, משימת רקע שרצה כל דקה, ובעלים ראשון. אין בו שום נתון עסקי.

**סדר הפעולות:** Supabase → מיגרציות → הרצה מקומית → בעלים ראשון → Vercel → cron → (רשות) WhatsApp, Push, Google.

זמן משוער: 30–45 דקות בלי WhatsApp.

---

## 0. מה צריך מראש

- Node.js 20 ומעלה, ו-npm.
- חשבון [Supabase](https://supabase.com). הפרויקט נוצר בארגון משלך; גם Free מספיק להתחלה.
- חשבון [Vercel](https://vercel.com). גם Hobby מספיק.
- Supabase CLI. אפשר להריץ דרך `npx supabase`, בלי התקנה ובלי Docker.

---

## 1. פרויקט Supabase

1. ב-Supabase יוצרים פרויקט חדש: **New project**.
   - Region: `eu-central-1` (פרנקפורט) קרוב לישראל.
   - שומרים את סיסמת מסד הנתונים.
2. ב-**Project Settings → API** מעתיקים שלושה ערכים:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / `publishable` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` / `secret` key → `SUPABASE_SERVICE_ROLE_KEY`. **סודי.** הוא נשמר רק בשרת ולא נכנס ל-git.
3. ב-**Authentication → URL Configuration**:
   - `Site URL` = כתובת האפליקציה. בהתחלה `http://localhost:3000`; אחרי הפריסה מחליפים לכתובת ב-Vercel.
   - מוסיפים את שתי הכתובות גם ל-`Redirect URLs`.
   - מייל אישור ההרשמה מפנה ל-Site URL.
4. **אופציונלי:** ב-**Authentication → Sign In / Providers → Email** אפשר לכבות את `Confirm email` לפיתוח מקומי. אז ההרשמה נכנסת מיד, בלי מייל.

---

## 2. הרצת כל המיגרציות על הפרויקט הריק

ב-`supabase/migrations/` יש 35 קבצי SQL. הם נכתבו ידנית ורצים לפי סדר שם הקובץ (חותמת זמן). מתוך תיקיית הריפו:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <project-ref>
```

```bash
npx supabase db push
```

- `<project-ref>` הוא החלק שלפני `.supabase.co` בכתובת הפרויקט.
- `db push` מבקש את סיסמת מסד הנתונים ומריץ את כל הקבצים לפי הסדר, כל קובץ בטרנזקציה נפרדת.
- הוא זוכר מה כבר רץ, אז בפעם הבאה הוא מריץ רק מיגרציות חדשות.

**מה נוצר:**
- 47 טבלאות ב-`public`, כולן עם RLS.
- 97 מדיניות RLS.
- 35 פונקציות וטריגרים.
- שני buckets ב-Storage: `media` (ציבורי, לקבצים מצורפים בהודעות WhatsApp) ו-`files` (פרטי, לקבצים של לידים ורשומות).
- 10 טבלאות ב-Realtime.

**לא נוצר:** אף ארגון, משתמש או נתון. שלב 4 מטפל בזה.

> **אומת:** כל 35 המיגרציות רצו לפי הסדר על Postgres ריק בלי שגיאה. אחריהן עברו בהצלחה יצירת בעלים, ערכי פתיחה ובדיקת בידוד RLS: משתמש זר רואה 0 ארגונים ו-0 לידים.

**חלופה בלי CLI:** פותחים ב-**SQL Editor** כל קובץ מ-`supabase/migrations/` לפי הסדר ומריצים אותו. במסלול הזה ה-CLI לא יידע מה כבר רץ, אז עדיף `db push`.

> ⚠️ **לא להריץ `npm run db:generate`.** הקובץ `packages/db/drizzle.config.ts` כותב את הפלט שלו לתוך `supabase/migrations`, ומיגרציה אוטומטית של Drizzle תתנגש בקבצים הקיימים. מקור האמת הוא ה-SQL.

---

## 3. הרצה מקומית

```bash
npm install
```

```bash
cp docs/env.example apps/web/.env.local
```

ממלאים ב-`apps/web/.env.local` לפחות את שלושת המשתנים של Supabase ואת `CRON_SECRET`. ההסבר על כל משתנה נמצא ב-[`HANDOVER.md`](HANDOVER.md#8-משתני-סביבה). אחר כך:

```bash
npm run dev
```

האפליקציה עולה בכתובת http://localhost:3000.

---

## 4. ארגון ובעלים ראשונים

**אין באפליקציה מסך "צור ארגון".** כל אחד יכול להירשם ב-`/login`, אבל משתמש בלי חברות בארגון רואה רק "המשתמש לא משויך לארגון". הארגון הראשון נוצר פעם אחת ב-SQL:

1. נרשמים באפליקציה ב-`/login` → "הרשמה", עם המייל של הבעלים. מאשרים את המייל, אם אישור מייל פעיל.
2. ב-**SQL Editor** של Supabase מריצים את [`scripts/setup/01-first-org-owner.sql`](../scripts/setup/01-first-org-owner.sql), אחרי שמשנים בראש הקובץ את המייל ואת שם העסק.
3. מריצים את [`scripts/setup/02-starter-defaults.sql`](../scripts/setup/02-starter-defaults.sql), עם אותו שם עסק. הוא יוצר:
   - פייפליין "מכירות" עם 5 שלבים
   - 4 סטטוסי טיפול
   - סוג פגישה
   - שעות פעילות א'–ה' 09:00–18:00

   **הפייפליין הוא חובה בפועל.** כשאין לארגון אף פייפליין, מסך `/pipeline` מוצג ריק ואין ממנו דרך ליצור את הראשון (`app/pipeline/page.tsx`: `if (!pipeline) return null`). כל השאר ניתן לעריכה ולמחיקה בהגדרות.
4. מרעננים את האפליקציה: הבעלים נכנס לדשבורד.

**כל שאר המשתמשים** מצטרפים בהזמנה ממסך הגדרות → צוות. כשמוזמן נרשם עם אותו מייל, הטריגר `handle_new_user()` הופך את ההזמנה לחברות בארגון עם התפקיד שנבחר.

---

## 5. פריסה ל-Vercel

1. ב-Vercel: **Add New → Project** ומייבאים את הריפו מ-GitHub.
2. **Root Directory:** `apps/web`. Vercel מזהה את Next.js ואת ה-npm workspaces לבד.
3. ב-**Environment Variables** מוסיפים את כל המשתנים מ-`.env.local`, כולל `APP_URL` = הכתובת הסופית, למשל `https://<project>.vercel.app`.
4. **Deploy.**
5. חוזרים ל-Supabase ומעדכנים `Site URL` ו-`Redirect URLs` לכתובת של Vercel (שלב 1.3).

מעכשיו כל `git push` ל-`main` פורס לייצור, וכל branch אחר מקבל Preview.

---

## 6. משימת הרקע (cron), חובה

הנתיב `/api/cron/automations` צריך לרוץ **כל דקה**. בלי זה שום דבר מבוסס-זמן לא קורה:
- המתנות באוטומציות
- אוטומציות על רשומות
- תזכורות פגישה והודעות מתוזמנות
- התראות Push
- ניסיונות חוזרים של webhooks
- סנכרון Google Calendar

ב-Vercel Hobby אפשר להגדיר cron רק פעם ביום, ולכן התזמון יושב במסד הנתונים, ב-pg_cron וב-pg_net, שקיימים בכל פרויקט Supabase.

1. מוודאים ש-`CRON_SECRET` מוגדר ב-Vercel ושהאתר נפרס.
2. ב-**SQL Editor** מריצים את [`scripts/setup/03-cron.sql`](../scripts/setup/03-cron.sql), אחרי שמכניסים לו את כתובת האפליקציה ואת אותו ערך של `CRON_SECRET`.
   - הכתובת והסוד נשמרים ב-Supabase Vault, לא בטקסט של המשימה.
3. בודקים שזה עובד:
   ```sql
   select id, status_code, content from net._http_response order by id desc limit 5;
   ```
   - `200` עם JSON כמו `{"resumed":0,...}`: הכל תקין.
   - `401`: הסוד לא תואם.

---

## 7. רשות: WhatsApp, Push, Google, Meta

| יכולת | מה צריך | פירוט |
|---|---|---|
| WhatsApp (מספר עסקי משותף ומספר אישי לכל נציג) | שרת Evolution API משלך + `EVOLUTION_URL` / `EVOLUTION_API_KEY` | [`HANDOVER.md` §6](HANDOVER.md#6-whatsapp) וקובצי הדוגמה ב-[`docs/evolution/`](evolution/) |
| התראות Push | `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | כל משתמש מפעיל בהגדרות → התראות |
| Google Calendar | OAuth Client ב-Google Cloud: Redirect URI = `<APP_URL>/api/integrations/google/callback`, scope `calendar.events` + `GOOGLE_CLIENT_ID`/`SECRET` + `OAUTH_STATE_SECRET` | בפועל צריך דומיין משלך ואימות של מסך ההסכמה. ראו "פערים" ב-HANDOVER |
| WhatsApp Cloud API / Embedded Signup / Lead Ads | אפליקציית Meta מאומתת + `META_*` + webhook ב-`<APP_URL>/api/webhooks/meta` | בדפים הציבוריים `/privacy` ו-`/data-deletion` (נדרשים ל-Meta) יש להחליף את ה-`[סוגריים]` בפרטי העסק |

---

## 8. בדיקה מהירה שהכל עובד

1. מתחברים כבעלים → דשבורד.
2. **לידים:** יוצרים ליד. הטלפון מנורמל ל-`972…` וסטטוס הטיפול מקבל את הסטטוס הראשון.
3. **הגדרות → מקורות לידים:** יוצרים כתובת קליטה ושולחים אליה ליד:
   ```bash
   curl -X POST <APP_URL>/api/public/leads/<token> -H 'Content-Type: application/json' -d '{"name":"בדיקה","phone":"0501234567"}'
   ```
4. **אוטומציות:** יוצרים אוטומציה "ליד חדש → המתנה דקה → התראה" ובודקים שההתראה מגיעה תוך 1–2 דקות. זה מאמת שה-cron עובד.
5. **הגדרות → צוות:** מזמינים משתמש שני עם תפקיד מוגבל ובודקים שהוא רואה רק את מה שמותר לו.
