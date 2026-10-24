# מסמך מסירה: ה-CRM

> מסמך עבודה למפתח שממשיך את הפרויקט. הוא מתאר את הקוד ואת הסכמה **כפי שהם בפועל** (נכון ל-24.10.2026), כולל מה חסר ומה שבור.
> שמות בקוד (טבלאות, פונקציות, קבצים) מופיעים באנגלית כמו שהם.
> הקמת סביבה צעד-אחר-צעד נמצאת ב-[`SETUP.md`](SETUP.md).

## תוכן

1. [מה המוצר](#1-מה-המוצר)
2. [ארכיטקטורה](#2-ארכיטקטורה)
3. [מפת הקוד](#3-מפת-הקוד)
4. [פיצ'רים ומסכים](#4-פיצרים-ומסכים)
5. [הרשאות ותפקידים](#5-הרשאות-ותפקידים)
6. [WhatsApp](#6-whatsapp)
7. [מנוע האוטומציות ומשימת הרקע](#7-מנוע-האוטומציות-ומשימת-הרקע)
8. [משתני סביבה](#8-משתני-סביבה)
9. [מודל הנתונים והמיגרציות](#9-מודל-הנתונים-והמיגרציות)
10. [נתיבי API](#10-נתיבי-api)
11. [פיתוח: איך מוסיפים פיצ'ר](#11-פיתוח-איך-מוסיפים-פיצר)
12. [פערים ידועים, חוב טכני ומפת דרכים](#12-פערים-ידועים-חוב-טכני-ומפת-דרכים)
13. [סקריפטי ייבוא (דוגמה)](#13-סקריפטי-ייבוא-דוגמה)

---

## 1. מה המוצר

**CRM כללי מרובה ארגונים (SaaS)** לעסקים קטנים ובינוניים, בעברית ו-RTL. כל ארגון (טננט) רואה רק את הנתונים שלו. הבידוד נאכף במסד הנתונים עצמו (RLS), לא רק בממשק.

**העיקרון המנחה:** המוצר גנרי. עסק אחד שימש פיילוט, אבל אין להכניס לקוד שום דבר ספציפי לעסק מסוים. כל מה שמשתנה בין עסקים (שלבים, סטטוסים, שדות, טבלאות, הודעות, תפקידים) מוגדר כנתונים בהגדרות של הארגון.

**מה יש בו, בקצרה:**
- לידים עם שדות מותאמים, סטטוסי טיפול ושיוך לנציג
- פייפליין צבעוני (קנבן וטבלה)
- טבלאות מותאמות (custom objects) עם שדות מוקלדים
- אוטומציות על לידים ועל רשומות
- WhatsApp: מספר עסקי משותף, מספר אישי לכל נציג, ו-Cloud API של Meta
- הצעות מחיר והסכמים לחתימה אונליין, כולל ייבוא מ-PDF ומעקב קריאה
- קמפיינים, ייחוס מקורות ועלויות פרסום
- כתובות קליטת לידים (intake) ו-Meta Lead Ads
- זימון פגישות ציבורי ותזכורות פגישה אוטומטיות
- משימות, יומן, היסטוריית שיחות וקבצים
- התראות Push ואג'נדה בסרגל העליון
- תפקידים והרשאות שנאכפים ב-RLS

---

## 2. ארכיטקטורה

```
 דפדפן (PWA, Next.js client components)
   │  supabase-js עם session של המשתמש → כל קריאה/כתיבה רגילה עוברת RLS
   │  fetch עם Authorization: Bearer <access token> → נתיבי /api
   ▼
 Vercel: Next.js 16 App Router (apps/web)
   │  /api/*  → מאמת את המשתמש (requireUser), ואז כותב עם service role (supabaseAdmin)
   │  /api/webhooks/*  ← Meta, Evolution, Green-API
   │  /api/public/*    ← טפסים, זימון פגישות, חתימה על מסמכים (מפתח = טוקן ב-URL)
   │  /api/cron/automations  ← כל דקה, מ-pg_cron
   ▼
 Supabase: Postgres + RLS, Auth (מייל+סיסמה), Storage, Realtime
   │  pg_cron + pg_net → POST /api/cron/automations (Bearer CRON_SECRET)
   │  טריגרים: התראות, תזכורות פגישה, תור סנכרון יומן, אוטומציות רשומות
   ▼
 שרת Evolution API (Docker, self-hosted) ⇄ WhatsApp Web (Baileys)
```

**ההחלטות העיקריות:**
- **הכל client-side.** כל המסכים הם `"use client"`, ואין server components שטוענים נתונים, אין server actions ואין middleware. הנתונים נטענים בדפדפן דרך `lib/store.tsx`, שהוא React context גדול מעל supabase-js. ה-session נשמר ב-localStorage, ולכן נתיבי ה-API מקבלים את הטוקן ב-header ולא ב-cookie.
- **האבטחה ב-RLS.** הממשק מסתיר כפתורים, אבל ההרשאה האמיתית היא מדיניות RLS. כל טבלה כוללת `org_id` ומדיניות שמבוססת על `my_org_ids()`.
- **Service role רק בשרת.** כתיבות שהמשתמש לא אמור לעשות ישירות עוברות דרך `/api` עם `supabaseAdmin()`: שליחת הודעות, webhooks, פרטי גישה של ערוצים ושינוי הגדרות ארגון. טבלאות הסודות (`channel_credentials`, `calendar_credentials` ועוד) פתוחות רק ל-service role.
- **Realtime** על לידים, הודעות, שיחות, התראות, פגישות, מסמכים ורשומות, כך שהמסכים מתעדכנים בלי רענון.
- **משימת רקע אחת כל דקה** מטפלת בכל מה שמבוסס זמן (פירוט בסעיף 7).

**סטאק:** Next.js 16.3.4, React 19.2.8, TypeScript 5, Tailwind 4, `@supabase/supabase-js` 2, `@dnd-kit` (גרירה בקנבן), `papaparse` (CSV), `unpdf` (ייבוא PDF), `web-push`.

> ⚠️ **Next.js 16 שונה ממה שמודלים ומדריכים ישנים מכירים.** לפני כתיבת קוד Next, קוראים את המדריך הרלוונטי ב-`node_modules/next/dist/docs/` (ראו `apps/web/AGENTS.md`).

---

## 3. מפת הקוד

```
apps/web/src/
  app/                      מסכים (App Router) + api/
    api/                    נתיבי שרת (סעיף 10)
    book/[token]  d/[token] privacy  data-deletion  login     ← ציבוריים
  components/
    AppShell.tsx            תפריט צד, טאבים בנייד, חסימת מסכים לפי הרשאה
    AuthGate.tsx            הפניה ל-/login; "לא משויך לארגון"
    TopBar.tsx              אג'נדה + התראות
    leads/ inbox/ documents/ campaigns/ objects/ settings/ ui/
  lib/
    store.tsx               כל טעינת הנתונים והכתיבות מהדפדפן (~2,000 שורות)
    auth.tsx                session + הארגון הנוכחי (החברות הראשונה של המשתמש)
    permissions.ts          אילו מסכים התפקיד רואה
    types.ts                טיפוסי הדומיין
    templates.ts            פעולות מהירות + placeholders להודעות
    objects.ts              טבלאות מותאמות: סוגי שדות, תבניות מוכנות
    server/                 קוד שרת בלבד
      env.ts                כל משתני הסביבה (סעיף 8)
      auth.ts               requireUser / requireOrgRole / requireOwnOrg
      supabaseAdmin.ts      לקוח service role
      automations.ts        מנוע האוטומציות
      whatsapp.ts           בחירת ערוץ + שליחה (Cloud / Evolution / Green)
      evolution.ts greenApi.ts graph.ts embeddedSignup.ts
      leadMessages.ts       הודעות מתבניות + הודעות מתוזמנות
      booking.ts documents.ts pdfImport.ts push.ts googleCalendar.ts intake.ts
      webhooks/             עיבוד webhooks נכנסים (process, whatsapp, evolution, greenApi, leadgen)
packages/db/                סכמת Drizzle: ישנה ולא בשימוש (סעיף 12)
supabase/migrations/        35 קבצי SQL: מקור האמת לסכמה
scripts/setup/              הקמת ארגון ראשון, ערכי פתיחה, cron
scripts/import-fireberry*   דוגמה לייבוא ממערכת אחרת (סעיף 13)
docs/                       המסמך הזה, SETUP, env.example, evolution/
```

---

## 4. פיצ'רים ומסכים

> בממשק, "לידים" יושבים בנתיב `/contacts` ובטבלה `contacts`.

### מסגרת האפליקציה
- **תפריט צד:**
  - חיפוש
  - לוח בקרה, לידים, הטבלאות המותאמות של הארגון
  - וואטסאפ חברה, וואטסאפ אישי
  - פייפליין, הצעות והסכמים, קמפיינים, יומן, אוטומציות, טפסים, משימות
  - צוות, הגדרות
- **בנייד:** תפריט המבורגר, ובתחתית טאבים ללידים, משימות, יומן ופייפליין.
- **סרגל עליון:**
  - **אג'נדה:** המשימות והפגישות שלי לפי היום / מחר / השבוע / באיחור, עם סימון ביצוע.
  - **התראות:** ליד שויך אליך, הודעה נכנסת. נוצרות בטריגרים במסד הנתונים.
- **PWA:** `app/manifest.ts` ו-`public/sw.js` (Web Push).

### מסכים

| נתיב | מה יש בו |
|---|---|
| `/login` | התחברות והרשמה במייל וסיסמה (Supabase Auth). `/` מפנה ל-`/contacts`. |
| `/dashboard` | כמה מדדים: מספר לידים, עסקאות פתוחות, שווי פתוח, אחוז סגירה, עסקאות לפי שלב, משימות פתוחות ובאיחור. |
| `/contacts` | טבלת לידים: חיפוש, סינון לפי בעלים ("שלי" / לא משויכים / נציג), סינון מתקדם, בחירת עמודות (נשמרת לכל משתמש), שינוי סטטוס בתוך הטבלה, ייצוא CSV, דפדוף. |
| `/contacts/new`, `/contacts/import` | ליד ידני, וייבוא CSV עם מיפוי עמודות אוטומטי ותצוגה מקדימה. |
| `/contacts/[id]` | כרטיס ליד (פירוט מתחת לטבלה). |
| `/pipeline` | בחירת פייפליין ויצירת חדש. קנבן עם גרירה או טבלה. עריכת שם ושווי. סגירה כזכייה / הפסד (עם סיבה) / נטישה. שינוי שם, צבע ומחיקה של שלבים. ייצוא. |
| `/o/[typeId]`, `/o/[typeId]/[recordId]` | טבלה מותאמת: רשימה או לוח לפי שדה השלב, ודף רשומה עם עריכה, קבצים, שיחות, הערות, משימות ורשומות מקושרות. |
| `/inbox` | וואטסאפ חברה: שיחות של המספרים המשותפים והרשמיים, סינון לפי ערוץ, שליחת טקסט או תבנית Meta, פתיחת שיחה עם ליד. |
| `/my-whatsapp` | וואטסאפ אישי: המספר שהנציג חיבר. מנהלים רואים גם את התיבות של עמיתים, לקריאה בלבד. |
| `/documents` | מסמכים שנשלחו: סינון, נתוני קריאה (פתיחות, זמן, קריאה לפי סעיף), סטטיסטיקה לנציג, יצירה ושליחה ב-WhatsApp. |
| `/d/[token]` | **ציבורי.** צפייה במסמך, חתימה (שם, שדות, ציור חתימה, הסכמה) או דחייה עם סיבה. "הורדת PDF" היא `window.print()`. |
| `/campaigns` | ארבעה טאבים: דוח ביצועים, קמפיינים (כולל מיזוג), הוצאות פרסום, מקורות לידים (כתובות קליטה). |
| `/calendar` | חודש או רשימה, הוספת פגישה, סוגי פגישה עם בעלים ברירת מחדל, שעות פעילות (מזינות את `/book`). |
| `/book/[token]` | **ציבורי.** הליד בוחר מועד ב-14 הימים הקרובים, או משנה מועד קיים. מפעיל את `appointment_booked`. |
| `/automations` | רשימה, יצירה, הפעלה וכיבוי, ועורך שלבים. |
| `/forms` | בונה טפסים פשוט. **אין עדיין כתובת ציבורית או קוד הטמעה** (סעיף 12). |
| `/tasks` | שלי או של כולם, לפי באיחור / היום / בהמשך / בלי תאריך / בוצעו. |
| `/team` | חברים והזמנות: הזמנה (שם, מייל, מנהל/נציג), שינוי תפקיד, שיוך תפקיד מותאם, הסרה. **לא נשלח מייל.** המוזמן נרשם ב-`/login` עם אותו מייל. |
| `/search?q=` | חיפוש בלידים, עסקאות ומשימות. |
| `/settings/*` | פירוט מתחת לטבלה. |
| `/privacy`, `/data-deletion` | **ציבוריים.** דרישה של Meta. התבנית כללית ומכילה `[סוגריים]` שיש למלא בפרטי העסק. |

**כרטיס ליד** (`/contacts/[id]`) מכיל:
- עריכת פרטים
- פעולות מהירות: התקשרות, WhatsApp, "אין מענה" (סופר ניסיונות), "נקבעה פגישה", "אחרי פגישה"
- הודעות מתוזמנות
- משימות ותגיות
- שדות מותאמים, ורשומות מקושרות מטבלאות מותאמות
- מסמכים, שיחות וקבצים
- עסקאות, עם תוצאה ופתיחה מחדש
- הערות וציר זמן

**ההגדרות** (`components/settings/sections.tsx`):

| סעיף | קבוצה | מה בו |
|---|---|---|
| `notifications` | אישי | הרשמה ל-Push ובדיקה |
| `calendar` | אישי | חיבור Google Calendar |
| `my-whatsapp` | אישי | חיבור המספר האישי ב-QR. מנהלים מחברים כאן גם את המספר העסקי המשותף. |
| `objects` | נתונים | טבלאות מותאמות ושדות: text, number, date, select, user, contact, currency, phone, email, long_text ועוד |
| `lead-fields` | נתונים | שדות ליד מוקלדים, מחולקים לסעיפים |
| `lead-statuses` | נתונים | סטטוסי טיפול וצבעים |
| `messages` | תקשורת | הודעות מוכנות עם placeholders, שיוך לפעולה מהירה, קבצים מצורפים, תזכורות פגישה אוטומטיות |
| `documents` | תקשורת | תבניות מסמכים וייבוא PDF |
| `integrations` | תקשורת | ערוצי WhatsApp Cloud, Embedded Signup, Green-API, דפי פייסבוק ל-Lead Ads |
| `roles` | ניהול | תפקידים מותאמים (סעיף 5) |

**שיחות:** הרשימה בכרטיס ליד היא לקריאה בלבד. אין באפליקציה שום דבר שכותב לטבלה `calls`; היא מתמלאת רק מייבוא. אינטגרציה עם מרכזייה היא פער פתוח.

---

## 5. הרשאות ותפקידים

### שתי שכבות
1. **תפקיד בסיס** (`memberships.role`, enum `member_role`): `owner` / `admin` / `agent`.
   - owner ו-admin זהים כמעט בכל מקום, ויש להם גישה מלאה.
2. **תפקיד מותאם** (`roles` דרך `memberships.role_id`): חל **רק על agent**. agent בלי `role_id` מקבל גישה מלאה לנתונים.

### מה מגדירים בתפקיד מותאם

| שדה | ערכים | נאכף ב- |
|---|---|---|
| `leads_scope` | `all` / `own_unassigned` / `own` / `none` | RLS על `contacts` ועל כל טבלאות הבן: עסקאות, פעילות, משימות, פגישות, שיחות, הודעות, מסמכים, קבצים |
| `meetings_scope` | `all` / `own` | RLS על `appointments` (`owner_user_id = auth.uid()`) |
| `tasks_scope` | `all` / `own` | RLS על `tasks` (`assignee = my_full_name()`, השוואת שם) |
| `object_access` | `{object_type_id: all/own/none}` | RLS על `records` |
| `features` | רשימת מסכים: dashboard, inbox, pipeline, documents, campaigns, calendar, automations, forms, tasks, team, settings | בממשק (`lib/permissions.ts`, `AppShell.tsx`). ב-DB רק `automations` נאכף (`my_automation_org_ids()`). |

**"שלי" = לפי מייל.** בעלות על ליד נשמרת ב-`contacts.owner_email`, טקסט בלי FK. שיוך משימה נשמר ב-`tasks.assignee`, שם מלא כטקסט.

### פונקציות העזר של RLS
כולן `SECURITY DEFINER` ומבוססות על `auth.uid()`:

| פונקציה | מה היא מחזירה |
|---|---|
| `my_org_ids()` | הבסיס של כמעט כל מדיניות |
| `my_admin_org_ids()` | ארגונים שבהם המשתמש owner/admin |
| `my_all_leads_org_ids()`, `my_own_leads_org_ids()`, `my_unassigned_leads_org_ids()` | היקף הלידים |
| `my_all_meetings_org_ids()`, `my_all_tasks_org_ids()` | היקף הפגישות והמשימות |
| `my_record_access(org, type)` | רמת הגישה לטבלה מותאמת |
| `my_automation_org_ids()` | מי רשאי לנהל אוטומציות |
| `my_email()`, `my_full_name()` | המייל והשם של המשתמש |

### דפוסים לפי טבלה
- **חברים קוראים, מנהלים כותבים:** ערוצים, תבניות, סטטוסים, שדות, טבלאות מותאמות, תפקידים, מקורות לידים ועוד.
- **מחיקה רק למנהלים:** לידים, עסקאות, שלבים, אוטומציות, קמפיינים, מסמכים.
- **`memberships`, `invitations`:** הכל למנהלים בלבד.
- **`organizations`:** קריאה בלבד מהדפדפן. שינוי הגדרות עובר דרך `/api/org/settings`.
- **service role בלבד** (RLS פעיל בלי מדיניות): `channel_credentials`, `lead_ad_page_credentials`, `calendar_credentials`, `calendar_sync_jobs`, `webhook_events`.

### בנתיבי API
- `requireUser`: הטוקן מה-header, ומחזיר לקוח שכפוף ל-RLS.
- `requireOrgRole(['owner','admin'])`: מוודא תפקיד.
- `requireOwnOrg`: לוקח את **החברות הראשונה** של המשתמש (`limit(1)`).
- אחרי הבדיקה, הכתיבה נעשית עם `supabaseAdmin()`.

> **שימו לב:** מדיניות ההיקף (scope) חלה רק על **SELECT**. עדכון ומחיקה של משימות ופגישות לא מוגבלים לפי היקף התפקיד. ראו סעיף 12.

---

## 6. WhatsApp

יש שלוש דרכים לחבר מספר. כולן נשמרות כ-`channels` (עם `provider`) ו-`channel_credentials`:

| ספק | מה זה | מצב |
|---|---|---|
| **`evolution`** | שרת [Evolution API](https://github.com/EvolutionAPI/evolution-api) בהתקנה עצמית (WhatsApp Web / Baileys). חיבור בסריקת QR. | **הדרך העיקרית בפועל** |
| `green_api` | שירות מנוהל בתשלום (api.green-api.com), אותו עיקרון. | נתמך, מוצג בממשק רק כש-Evolution לא מוגדר |
| `whatsapp_cloud` | ה-API הרשמי של Meta: מספר ידני או Embedded Signup (כולל coexistence), תבניות, חלון 24 שעות | ממומש, דורש אפליקציית Meta מאומתת (Tech Provider) |

### מספר עסקי משותף ומספר אישי
- **מספר אישי:** לכל נציג מספר משלו, שהוא מחבר בהגדרות → "הוואטסאפ שלי".
  - שם ה-instance: `crm-<membershipId>`.
  - `channels.owner_membership_id` = החברות של הנציג.
  - אי אפשר לשלוח ממספר אישי של עמית: נבדק בשרת ב-`api/messages/send` וב-`whatsapp.ts` (`senderChannel`).
- **מספר עסקי משותף:** מנהל מחבר אותו.
  - `owner_membership_id = null`, `is_default = true`, כל הצוות שולח ממנו.
  - שם ה-instance: `crm-org-<8 תווים מה-org>-<hex אקראי>`.
- **סדר בחירת ערוץ בשליחה:** הערוץ שנבחר במפורש → המספר האישי של השולח → המספר המשותף.

### זרימת Evolution
1. **חיבור:** `POST /api/channels/gateway` עם `connect_evolution` → `instance/create` בשרת. ה-webhook נרשם לכתובת `<origin>/api/webhooks/evolution/<secret>`, כאשר `secret` נשמר ב-`channel_credentials.webhook_secret`.
2. **QR וסטטוס:** אותו נתיב עם `status`. הסטטוס `open` מתורגם ל-`authorized`.
3. **הודעות נכנסות:** `api/webhooks/evolution/[secret]` שומר ל-`webhook_events`, עונה 200, ומעבד ב-`after()` (`lib/server/webhooks/evolution.ts`).
   - **נשמרות רק שיחות עם לידים קיימים**, לפי `contacts.phone_digits`. קבוצות לא נשמרות.
   - הודעות שנשלחו מהטלפון עצמו נשמרות עם `origin='phone_app'`.
4. **שליחה:** `sendText` / `sendMedia` / `sendWhatsAppAudio`. בשער (gateway) אין חלון 24 שעות ואין תבניות Meta.

### הקמת שרת Evolution משלך
**דוגמה:** [`docs/evolution/`](evolution/) (`docker-compose.yml`, `Caddyfile`, `evolution.env.example`).

1. **שרת:** VPS בגודל 2GB / 2vCPU מספיק (למשל Hetzner, כ-5–15$ לחודש) עם Docker ו-HTTPS (Caddy, אוטומטי).
2. **כתובת:** אפשר `<ip-במקפים>.sslip.io` עד שיש דומיין.
3. **ב-CRM:** `EVOLUTION_URL=https://<host>` ו-`EVOLUTION_API_KEY` = הערך של `AUTHENTICATION_API_KEY` בשרת.
4. **פרטיות:** בדוגמה `DATABASE_SAVE_DATA_NEW_MESSAGE=false`, כך שהשרת לא שומר תוכן הודעות. ה-CRM שומר אותן בעצמו.
5. **GIF (אופציונלי):** Evolution קובע `gifPlayback=false` בקוד, ולכן GIF נשלח כווידאו רגיל. התיקון: עותק של `dist/main.js` מתוך ה-image, עם השורה שמחליפה את הערך ל-`!!e.gifPlayback`, שמותקן read-only מעל הקובץ המקורי. **אחרי כל שדרוג image צריך ליצור את התיקון מחדש.**

**סיכונים:**
- WhatsApp Web לא רשמי. Meta יכולה לחסום מספר שנראה כמו ספאם. לשליחה המונית צריך Cloud API.
- ה-webhook נבנה מה-origin של הבקשה ברגע החיבור. אם מחברים מכתובת Preview, ה-webhook יצביע ל-Preview.

---

## 7. מנוע האוטומציות ומשימת הרקע

**הקוד:** `lib/server/automations.ts`. **הטבלאות:** `automations`, `automation_steps`, `automation_runs`.

### טריגרים

| טריגר | מאיפה הוא מופעל |
|---|---|
| `new_contact` | כתובת קליטה, Meta Lead Ads, יצירה בממשק |
| `stage_change`, `tag_added`, `status_changed` | מהממשק, דרך `POST /api/automations/trigger` |
| `appointment_booked` | הזמנה ראשונה ב-`/book` |
| `document_viewed`, `document_signed` | צפייה ראשונה וחתימה |
| `record_created`, `record_stage_changed`, `record_field_changed` | **טריגר ב-DB** (`queue_record_automations`). יוצר run עם `waiting`, ולכן הוא רץ בטיק הבא של ה-cron. |

### תנאים
סינון התאמה מדויקת לפי שדות על האוטומציה:
- לידים: `trigger_pipeline_id`, `trigger_stage_id`, `trigger_tag`, `trigger_source`, `trigger_status`.
- רשומות: `trigger_object_type_id`, `trigger_field`, `trigger_value`.

**אין בונה תנאים כללי.**

### פעולות
- `send_message`: WhatsApp, טקסט או הודעה מוכנה, מהמספר של בעל הליד או מהמספר המשותף.
- `wait`: עוצר את ה-run עם `resume_at`.
- `set_status`, `move_stage` (יוצר עסקה אם אין), `set_owner`.
- `create_task`, `notify`, `add_tag`, `update_field` (ברשומות).

**Placeholders בהודעות:**
- `{{name}}`, `{{first_name}}`, `{{phone}}`, `{{email}}`, `{{booking_token}}`, `{{field:X}}`
- ברשומות: `{{record_title}}`, `{{record:X}}`

### התנהגות
- פעולה של אוטומציה על ליד **לא** מפעילה אוטומציות נוספות, כדי למנוע לולאות. ברשומות, ההגנה היא ה-GUC `crm.from_automation`.
- `stop_on_reply` (ברירת מחדל: כן): הודעה נכנסת מבטלת runs שממתינים.
- run שנכשל מסומן `failed` ואין ניסיון חוזר.

### משימת הרקע: `GET|POST /api/cron/automations`
**כל דקה,** עם `Authorization: Bearer <CRON_SECRET>`. ההגדרה ב-[`scripts/setup/03-cron.sql`](../scripts/setup/03-cron.sql) (pg_cron + pg_net + Vault). בכל טיק, לפי הסדר:

1. `resumeDueRuns`: מחדש runs שזמן ההמתנה שלהם עבר. ה-claim נעשה דרך `claim_due_automation_runs` עם `FOR UPDATE SKIP LOCKED`.
2. `retryPendingWebhookEvents`: עד 5 ניסיונות, על אירועים מהיומיים האחרונים.
3. `sendDueScheduledMessages`: תזכורות פגישה והודעות מתוזמנות, 25 לטיק.
4. `sendPendingPushes`: התראות Push.
5. `processCalendarJobs`: סנכרון ל-Google Calendar.

**תזכורות פגישה:**
- מופעלות כש-`organizations.meeting_reminders = true`.
- יצירת פגישה מפעילה טריגר שמכניס ל-`scheduled_messages` שורה לכל הודעה מוכנה עם `quick_action` מסוג `meeting_reminder_3d` / `_1d` / `_day`.
- `_day` נשלחת ב-09:00 שעון ישראל.
- שינוי מועד הפגישה מזיז את התזכורות.

---

## 8. משתני סביבה

התבנית נמצאת ב-[`docs/env.example`](env.example). כולם נקראים ב-`lib/server/env.ts`, חוץ מאלה שמתחילים ב-`NEXT_PUBLIC_` ונקראים גם בדפדפן. **ערכים לא נשמרים ב-git.** מקומית הם ב-`apps/web/.env.local`; בייצור הם ב-Vercel.

| משתנה | חובה | תפקיד |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | כתובת פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | מפתח ציבורי (anon/publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | מפתח service role. **שרת בלבד**, עוקף RLS |
| `CRON_SECRET` | ✅ בפועל | סוד משימת הרקע. בלעדיו ה-cron מחזיר 401 |
| `APP_URL` | מומלץ | הכתובת הציבורית, לקישורים בהודעות. ברירת מחדל `http://localhost:3000` |
| `EVOLUTION_URL`, `EVOLUTION_API_KEY` | ל-WhatsApp | שרת Evolution. כשהם מוגדרים, הממשק מציע חיבור ב-QR |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | ל-Push | `npx web-push generate-vapid-keys`. ה-subject הוא `mailto:` או URL |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET` | ל-Google Calendar | OAuth client. השלישי הוא מחרוזת אקראית לחתימת ה-state |
| `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | ל-Meta | Cloud API, Embedded Signup, Lead Ads, ואימות חתימת webhook |
| `META_GRAPH_VERSION` | – | ברירת מחדל `v25.0`. צריך להתאים ל-`GRAPH_VERSION` ב-`lib/facebookSdk.ts` |
| `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_ES_CONFIG_ID` | ל-Embedded Signup | חלון ההרשמה של Meta בדפדפן |
| `DATABASE_URL` | – | רק ל-`drizzle-kit` (לא בשימוש) |

---

## 9. מודל הנתונים והמיגרציות

**47 טבלאות ב-`public`, כולן עם RLS.** מפתח הטננט הוא `org_id → organizations(id) on delete cascade`.

### קבוצות טבלאות

| תחום | טבלאות |
|---|---|
| טננט וגישה | `organizations`, `users` (מראה של `auth.users`), `memberships`, `invitations`, `roles` |
| לידים ומכירות | `contacts`, `contact_field_defs`, `lead_statuses`, `pipelines` → `stages`, `opportunities`, `activities` (ציר זמן), `tasks`, `notifications` |
| יומן | `appointment_types`, `appointments`, `availability_rules`, `calendar_connections`, `calendar_credentials`, `calendar_sync_jobs` |
| טפסים | `forms`, `form_fields` |
| אוטומציות | `automations`, `automation_steps`, `automation_runs` |
| הודעות | `channels`, `channel_credentials`, `conversations`, `messages`, `message_templates`, `scheduled_messages`, `webhook_events` |
| Meta וקמפיינים | `lead_ad_pages`, `lead_ad_page_credentials`, `lead_ad_submissions`, `campaigns`, `campaign_spend`, `lead_sources` |
| מסמכים | `document_templates`, `documents`, `document_views` |
| טבלאות מותאמות | `object_types`, `object_fields`, `records` (ערכים ב-`data jsonb` עם אינדקס GIN) |
| שונות | `calls`, `files`, `push_subscriptions` |

### נקודות חשובות במודל
- **טלפון:**
  - `contacts.phone_digits` הוא עמודה מחושבת: `normalize_phone()`, שהופך 0 בהתחלה ל-972.
  - לפיה מתאימים הודעות נכנסות לליד.
- **עמודות קישור בלי FK:**
  - `contacts.handling_status` הוא **שם** הסטטוס (טקסט), בלי FK ל-`lead_statuses`.
  - `owner_email` ו-`tasks.assignee` גם הם טקסט בלי FK.
- **ייבוא חוזר:** `external_ref` עם unique לפי ארגון ב-contacts, opportunities, activities, appointments, tasks ו-records. זה מאפשר ייבוא חוזר בלי כפילויות.
- **Storage:** נתיבים בפורמט `<org_id>/...`. מדיניות ה-Storage בודקת שהתיקייה הראשונה שייכת לארגון של המשתמש.
  - `media` ציבורי: קבצים מצורפים, כדי ש-WhatsApp יוכל למשוך אותם.
  - `files` פרטי: גישה דרך signed URL ל-5 דקות.
- **Realtime:** activities, appointments, campaigns, contacts, conversations, documents, messages, notifications, records, scheduled_messages.
- **הנחות ישראליות בקוד:** אזור זמן `Asia/Jerusalem`, מטבע ₪/`ILS`, נרמול טלפון ל-972. לפני לקוח מחוץ לישראל צריך להפוך אותן להגדרה ברמת הארגון.

### המיגרציות לפי הסדר

| # | קובץ | מה הוא מוסיף |
|---|---|---|
| 1 | `20260911000000_core_tenant_schema` | ארגונים, משתמשים, חברויות, הזמנות. `handle_new_user()` על `auth.users` |
| 2 | `20260912000000_leads_pipeline_and_modules` | לידים, פייפליין, עסקאות, פעילות, משימות, יומן, טפסים, אוטומציות, התראות |
| 3 | `20260912010000_invitations_name` | שם בהזמנה |
| 4 | `20260912020000_fix_rls_recursion` | `my_org_ids()` / `my_admin_org_ids()` ומדיניות שנבנתה מחדש (תיקון 42P17) |
| 5 | `20260923000000_messaging_and_lead_ads` | ערוצים, שיחות, הודעות, webhooks, Lead Ads, `normalize_phone`, מנוע ה-runs |
| 6 | `20260923010000_booking_token_and_url_buttons` | `booking_token`, פרמטר כפתור URL בתבנית |
| 7 | `20261001000000_embedded_signup` | שדות Embedded Signup |
| 8 | `20261001010000_online_booking` | זימון ציבורי, טריגר `appointment_booked` |
| 9 | `20261001020000_outcomes_owners_imports_invites` | תוצאת עסקה, `owner_email`, `external_ref`, הזמנה שהופכת לחברות |
| 10 | `20261007000000_campaigns_attribution` | קמפיינים, הוצאות, מקורות לידים, ייחוס |
| 11 | `20261018000000_lead_source_field_map` | מיפוי שדות בכתובת קליטה |
| 12 | `20261019000000_message_templates_quick_actions` | הודעות מוכנות ופעולות מהירות |
| 13 | `20261019010000_whatsapp_gateway_scheduled_messages` | Green-API, `scheduled_messages` |
| 14 | `20261019020000_reschedule_reminders_with_meeting` | הזזת תזכורות עם הפגישה |
| 15 | `20261019030000_contacts_last_activity` | `last_activity_at` |
| 16 | `20261019040000_push_notifications` | Push, טריגרים להתראות |
| 17 | `20261019050000_google_calendar_sync` | Google Calendar |
| 18 | `20261019060000_lead_statuses_owner_sender` | סטטוסי טיפול, שליחה מהמספר של בעל הליד |
| 19 | `20261019070000_evolution_gateway` | ספק `evolution` |
| 20 | `20261019080000_message_attachments_meeting_reminders` | קבצים מצורפים, bucket `media`, תזכורות פגישה |
| 21 | `20261019090000_documents` | מסמכים וחתימה |
| 22 | `20261019091000_document_tracking` | מעקב קריאה |
| 23 | `20261019100000_appointment_type_default_owner` | בעלים ברירת מחדל לסוג פגישה |
| 24 | `20261019101000_gif_attachments` | GIF |
| 25 | `20261019110000_custom_objects` | טבלאות מותאמות |
| 26 | `20261019120000_calls` | שיחות |
| 27 | `20261019130000_typed_lead_fields` | שדות ליד מוקלדים |
| 28 | `20261019140000_roles_permissions` | תפקידים מותאמים ו-RLS לפי היקף |
| 29 | `20261019150000_files` | קבצים, bucket `files` |
| 30 | `20261019160000_role_meeting_task_scope` | היקף פגישות ומשימות |
| 31 | `20261019170000_stage_status_colors` | צבעים |
| 32 | `20261019180000_record_automations` | אוטומציות על רשומות |
| 33 | `20261020090000_opportunity_stage_changed_at` | `stage_changed_at` |
| 34 | `20261020100000_automation_permissions` | הרשאת אוטומציות |
| 35 | `20261020110000_lead_automation_actions` | פעולות `set_status` / `move_stage` / `set_owner` |

**אומת:** כל 35 המיגרציות רצות לפי הסדר על מסד נתונים ריק. אין בהן נתוני טננט, רק שני buckets. ה-UPDATE-ים הם backfill שלא עושה כלום על מסד ריק.

---

## 10. נתיבי API

| נתיב | מטרה | אימות |
|---|---|---|
| `POST /api/automations/trigger` | הפעלת אוטומציות מאירוע בממשק | משתמש |
| `POST /api/channels` | הוספת מספר Cloud API | owner/admin |
| `POST /api/channels/gateway` | Evolution / Green: `config`, `connect_evolution`, `connect`, `status`, `disconnect` | משתמש. מנהל למספר משותף או של אחרים |
| `GET/POST /api/cron/automations` | משימת הרקע | `Bearer CRON_SECRET` |
| `POST /api/documents/import-pdf` | PDF (עד 4MB) → סעיפי תבנית | owner/admin |
| `POST /api/integrations/google`, `GET .../callback` | OAuth ל-Google Calendar | משתמש; state חתום |
| `POST /api/lead-pages` | חיבור דף פייסבוק ל-Lead Ads | owner/admin |
| `POST /api/leads/[id]/schedule` | תזמון הודעות לליד | משתמש |
| `POST /api/leads/[id]/whatsapp` | שליחה מיידית לליד | משתמש |
| `POST /api/messages/send` | שליחה מתיבת הדואר | משתמש |
| `POST /api/org/settings` | הגדרות ארגון (`meeting_reminders`) | owner/admin |
| `GET/POST /api/public/booking/[token]` | זימון פגישה ציבורי | טוקן של הליד |
| `GET/POST /api/public/documents/[token]` | צפייה, חתימה, דחייה | טוקן של המסמך |
| `POST /api/public/leads/[token]` | קליטת לידים: JSON, form, או שורות `@key=value`. CORS פתוח | טוקן של המקור |
| `POST /api/push` | הרשמה ל-Push ובדיקה | משתמש |
| `POST /api/webhooks/evolution/[secret]` | Evolution נכנס | סוד ב-URL |
| `POST /api/webhooks/green-api/[secret]` | Green-API נכנס | סוד ב-URL |
| `GET/POST /api/webhooks/meta` | WhatsApp Cloud ו-Lead Ads | verify token + חתימת HMAC |
| `POST /api/whatsapp/embedded-signup`, `/sync-history` | Embedded Signup ו-coexistence | owner/admin |

**עקרון ה-webhooks:** כל webhook נשמר ל-`webhook_events` **לפני** החזרת 200, ומעובד אחר כך. מה שנכשל נוסה שוב ב-cron.

---

## 11. פיתוח: איך מוסיפים פיצ'ר

**הרצה מקומית:** ראו [`SETUP.md`](SETUP.md).

```bash
npm run dev
```

```bash
npm run build --workspace=apps/web
```

```bash
npm run lint --workspace=apps/web
```

אין בדיקות אוטומטיות בריפו.

### טבלה חדשה
1. קובץ חדש `supabase/migrations/<YYYYMMDDHHMMSS>_<שם>.sql`, עם חותמת זמן מאוחרת מהאחרונה.
   - **לעולם לא עורכים מיגרציה קיימת.**
2. בטבלה: `org_id uuid not null references organizations(id) on delete cascade`, ו-`alter table … enable row level security`.
3. מדיניות לפי הדפוס הקיים:
   ```sql
   create policy "members read x" on x for select using (org_id in (select my_org_ids()));
   create policy "admins manage x" on x for all using (org_id in (select my_admin_org_ids())) with check (org_id in (select my_admin_org_ids()));
   ```
   - טבלה שקשורה לליד מקבלת גם מדיניות `restrictive` של "lead visibility", כמו בקובץ 28.
   - **טבלה בלי org_id ובלי מדיניות היא באג אבטחה.**
4. אם המסכים צריכים עדכון חי: `alter publication supabase_realtime add table x;`.
5. מריצים `npx supabase db push`.

**כלל לגבי enum:** ערך שנוסף עם `alter type … add value` לא ישמש באותה מיגרציה מחוץ לגוף של plpgsql.

### מסך חדש
1. `apps/web/src/app/<נתיב>/page.tsx`, עם `"use client"` כמו כל השאר.
2. נתונים: מוסיפים טעינה ופעולות ל-`lib/store.tsx`, וטיפוסים ל-`lib/types.ts`.
3. אם המסך צריך הרשאה: מוסיפים feature id ל-`lib/permissions.ts` ולתפריט ב-`components/AppShell.tsx`.
4. הגדרות חדשות נוספות כסעיף ב-`components/settings/sections.tsx`.

### פעולה בצד שרת
1. `app/api/<…>/route.ts`.
2. מאמתים עם `requireUser` / `requireOrgRole` מ-`lib/server/auth.ts`.
3. כותבים עם `supabaseAdmin()` רק אחרי בדיקת ההרשאה.
4. קריאה מהדפדפן דרך `lib/api.ts`, ששולח את ה-Bearer token.

### טריגר או פעולה חדשים לאוטומציות
1. ערך enum במיגרציה (`automation_trigger_type` / `automation_step_type`).
2. טיפול ב-`lib/server/automations.ts` (`executeStep` / `triggerAutomations`).
3. אפשרות בממשק ב-`app/automations/page.tsx`.

### פריסה
- `git push` ל-`main` פורס ל-Vercel. branch אחר מקבל Preview.
- מיגרציות **לא** רצות אוטומטית בפריסה: מריצים `db push` לפני שקוד שתלוי בהן עולה.

---

## 12. פערים ידועים, חוב טכני ומפת דרכים

### חוסם / חשוב
- **אין יצירת ארגון מהממשק.** ארגון ובעלים נוצרים ב-SQL (`scripts/setup/01-first-org-owner.sql`). כדי למכור כ-SaaS צריך הרשמה עצמית: מסך "צור ארגון", RPC `security definer` שיוצר ארגון ובעלים, וערכי פתיחה.
- **`/pipeline` ריק כשאין פייפליין** (`if (!pipeline) return null`), ולכן אי אפשר ליצור את הראשון מהממשק. היום זה נפתר עם `02-starter-defaults.sql`. **תיקון קטן:** empty state עם כפתור "פייפליין חדש".
- **מעבר בין ארגונים:** `lib/auth.tsx` ו-`requireOwnOrg` לוקחים את החברות הראשונה. משתמש בשני ארגונים יראה רק אחד.
- **הזמנות לא שולחות מייל.** המוזמן צריך לדעת שעליו להירשם עם אותו מייל.
- **היקף התפקיד חל רק על קריאה.** עדכון ומחיקה של משימות ופגישות לא מוגבלים לפי `meetings_scope` / `tasks_scope`.
- **שיוך משימות לפי שם**: `tasks.assignee` הוא טקסט, ושינוי שם משתמש שובר את "המשימות שלי". מומלץ לעבור ל-`assignee_user_id`.

### אינטגרציות שמחכות לתשתית
- **Google Calendar:** הקוד מוכן (סנכרון חד-כיווני מה-CRM ליומן). כדי לפתוח למשתמשים חיצוניים צריך:
  - דומיין משלך, לא `*.vercel.app`
  - OAuth client עם Redirect URI תקין
  - אימות של מסך ההסכמה ב-Google, כי `calendar.events` הוא scope רגיש
  - אין סנכרון מ-Google חזרה ל-CRM
- **Meta (Cloud API / Embedded Signup / Lead Ads):** ממומש, אבל דורש אימות עסק ב-Meta Business ואישור האפליקציה כ-Tech Provider. התהליך הזה ארוך, ועדיף להתחיל אותו מוקדם. לפני כן צריך למלא את `/privacy` ו-`/data-deletion`.
- **מרכזייה / שיחות:** טבלת `calls` מתמלאת רק מייבוא. אין webhook ממרכזייה (למשל Voicenter) ואין חייגן.
- **מייל:** האפליקציה לא שולחת מיילים. רק Supabase Auth שולח מייל אישור הרשמה. לייצור צריך SMTP משלך ב-Supabase, כי המובנה מוגבל בכמות.

### חוב טכני
- **`packages/db` (Drizzle) ישן ולא בשימוש.** חסרות בו כמחצית מהטבלאות, והאפליקציה לא מייבאת ממנו. בנוסף `drizzle.config.ts` כותב לתוך `supabase/migrations`. אפשר למחוק את החבילה או לייצר ממנה טיפוסים בלבד. עדיף `supabase gen types`.
- **`lib/store.tsx` ענק** (כ-2,000 שורות, ומכיל את כל הנתונים של הארגון). בארגונים גדולים זה יאט. כדאי לפצל לפי תחום ולטעון לפי דף.
- **`NotificationsBell.tsx`** קוד מת.
- **בונה הטפסים** (`/forms`) לא מפרסם טופס ציבורי, ואין כתובת ואין קוד הטמעה. היום קליטת לידים עובדת דרך כתובות הקליטה בקמפיינים.
- **אוטומציה עם `send_message` טקסט חופשי בלי ערוץ מוגדר** בוחרת רק ערוצי `whatsapp_cloud` (`whatsapp.ts`, `resolveChannel`). בארגון שיש לו רק Evolution, הצעד הזה ייכשל. הפתרון הוא לבחור ערוץ בצעד, או "מהמספר של בעל הליד".
- **run שקרס באמצע** נשאר `running` לנצח. אין מנגנון שמנקה אותו.
- **חיבור מחדש של המספר המשותף** יוצר instance חדש בכל פעם (שם אקראי).
- **פונקציות בלי `set search_path`** (למשל `normalize_phone`, `claim_due_automation_runs`): Supabase Advisors יתריעו. זו אזהרה, לא תקלה.
- **`revoke … from anon`** לבד לא מבטל את ה-grant ל-PUBLIC. אין נזק כרגע, כי הפונקציות מחזירות ריק ל-anon.
- **הנחות ישראליות:** אזור זמן, ₪ וקידומת 972 כתובים בקוד (סעיף 9).

### פעולות מהירות שמבוססות על שמות שלבים
`components/leads/useLeadActions.tsx` מחפש שלבים שהשם שלהם **מכיל** "ללא מענה" / "נקבעה פגישה" / "אחרי פגישה", ו-`lib/templates.ts` מגדיר סט קבוע של פעולות מהירות:
- `no_answer_1`…`4`
- `meeting_online` / `meeting_office`
- תזכורות
- `after_meeting`
- `send_document`

זה תהליך מכירה טלפוני שנבנה בפיילוט. בעתיד כדאי להפוך את המיפוי בין פעולה לשלב או לסטטוס להגדרה ברמת הארגון.

### מפת דרכים מוצעת
1. הרשמה עצמית ויצירת ארגון, ערכי פתיחה אוטומטיים, empty state לפייפליין.
2. מעבר בין ארגונים, ומייל הזמנה.
3. דשבורדים לפי תפקיד (נציג / מנהל) עם יעדים.
4. דומיין, ואז Google Calendar ואימות Meta.
5. טופס ציבורי והטמעה מ-`/forms`.
6. אינטגרציית מרכזייה.
7. הגדרות אזור (אזור זמן, מטבע, קידומת).

---

## 13. סקריפטי ייבוא (דוגמה)

`scripts/import-fireberry*.mjs` ייבאו את הנתונים של עסק הפיילוט ממערכת Fireberry. הם **ספציפיים לייצוא של Fireberry ולעסק ההוא** (מזהי שדות, מיפוי שלבים), ונשמרו כ**דוגמה** לכתיבת ייבוא:

| סקריפט | מה הוא מייבא |
|---|---|
| `import-fireberry.mjs` | לידים (מיזוג לפי טלפון), עסקה לכל ליד, הערות, פגישות, משימות, הזמנות לצוות |
| `import-fireberry-objects.mjs` | טבלאות מותאמות (למשל לקוחות ונכסים) |
| `import-fireberry-history.mjs` | היסטוריה |
| `import-fireberry-calls.mjs` | שיחות |
| `import-fireberry-files.mjs` | קבצים ל-bucket `files` |

**עקרונות שכדאי להעתיק:**
- **dry run כברירת מחדל**, ו-`--commit` כדי לכתוב באמת.
- **`external_ref`** (למשל `fireberry:<guid>`): ריצה חוזרת לא יוצרת כפילויות, ו-`--update` מעדכן רשומות קיימות.
- **`--org <uuid>`**: הסקריפט כותב לארגון אחד בלבד, דרך service role.

הסקריפטים קוראים את `apps/web/.env.local` ישירות, ודורשים בו `NEXT_PUBLIC_SUPABASE_URL` ו-`SUPABASE_SERVICE_ROLE_KEY`.
