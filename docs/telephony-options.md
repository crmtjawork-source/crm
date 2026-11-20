<div dir="rtl">

# טלפוניה ב-CRM: חלופות, השוואה והמלצה

נבדק ב-**2026-11-20** מול דפי תיעוד ומחירים חיים. מחירים משתנים, לכן כל מחיר מסומן "כפי שנראה ב-2026-11-20".
**מסמך זה אינו ייעוץ משפטי.** מה שלא הצלחתי לאמת מסומן **[לא מאומת]**.

## TL;DR והמלצה

- **ספק מומלץ (שלב 2): Voicenter.** הלקוח כבר עובד איתו דרך Fireberry, ולכן אין צורך להחליף מספרים או מרכזיה. יש לו click-to-call API, Webhook של CDR עם קישור הקלטה, ו-CDR API למשיכה חוזרת. גם הלקוח וגם Fireberry משתמשים בפורמט ה-CDR שלו, כך שההגירה נמוכה בסיכון.
- **גיבוי / חלופה גמישה: Telnyx או Twilio.** יתרון: webhook חתום, SDK ל-WebRTC, הקלטה דו-ערוצית. חיסרון: הקמה מורכבת יותר, חבילת מסמכים לשיחות עם מספר ישראלי, ועלות דקה גבוהה יותר ללא "מספר ישראלי". לא מומלץ כספק ראשי ללקוח ישראלי שכבר על Voicenter.
- **שלב 1 (עכשיו, בלי הרשמה לשום דבר):**
  1. כפתור חיוג בכרטיס הליד כקישור `tel:` (נפתח באפליקציית הטלפון בנייד ובאפליקציית חיוג בדסקטופ).
  2. תיעוד שיחה ידני: אחרי החיוג מופיע בכרטיס טופס קצר (תוצאה, הערה, משימת המשך). שומרים `call_started_at` מצד הלקוח.
  3. תכנון סכמה כבר עכשיו: טבלת `calls` עם `provider`, `provider_call_id`, `direction`, `from`, `to`, `started_at`, `duration_sec`, `status`, `recording_url`, `raw jsonb`. כך שלב 2 הוא רק הוספת endpoint של webhook.
- **שלב 2 (מומלץ):** Voicenter. endpoint של webhook ל-CDR, כפתור click-to-call (callback: הנציג מקבל שיחה לנייד/סופטפון ואז הליד), והורדת הקלטות לאחסון שלנו (Supabase Storage) לצורך תמלול.
- **שיטת callback (גשר בין נייד הנציג לליד) מול סופטפון WebRTC:** callback הוא הפשוט ביותר, כי הנציג משתמש בנייד שלו, בלי התקנה ובלי בעיות מיקרופון בדפדפן. סופטפון WebRTC נותן חוויה מובנית בכרטיס הליד, אך דורש יותר עבודה ובדיקות. ממליץ להתחיל ב-callback.

## טבלת השוואה

| ספק | עלות חודשית | דקה לנייד/קווי ישראלי | מספר ישראלי / ניוד | Caller-ID יוצא | הקלטה | Webhook/CDR | Click-to-call | WebRTC SDK | תמיכה/עברית | מאמץ הקמה |
|---|---|---|---|---|---|---|---|---|---|---|
| **Voicenter** | [לא מאומת] לא פורסם באתר (נדרשת הצעה) | [לא מאומת] לפי חוזה | כן (ספק ישראלי, הלקוח כבר שם) | ניתן להגדיר `phonecallerid`/`targetcallerid` ("לא נתמך אצל כל ספק") | פרמטר `record=true`; קישור ב-`RecordURL`/`record` | CDR webhook (JSON/XML/form) + Call-Log API | כן, `click2call.aspx` | חבילת `@voicenter-team/opensips-js` (מאומת שקיימת ב-GitHub/npm) | ישראל, עברית | נמוך |
| **Twilio** | ללא מנוי; מספר מקומי $5.50, נייד $15, חינם $22 לחודש | מקומי (מספר ישראלי): קווי $0.0294, נייד $0.0646. ממספר זר: $0.0659 / $0.1868 | **לא מאומת** שאפשר לקנות מספר ישראלי מקומי (דף המחירים מציג, דף ה-guidelines מציין רק toll-free); ניוד לא מוזכר | Local CLI "לא מובטח" | $0.0025 לדקה + אחסון $0.0005/דקה/חודש; דו-ערוצי כברירת מחדל | Webhooks חתומים | כן (REST Calls) | Voice SDK (JS/iOS/Android) | אנגלית, אין תמיכה בישראל | בינוני-גבוה |
| **Telnyx** | ללא מנוי; מספרים מקומיים ישראליים מ-$3 לחודש | קול $0.002 + SIP trunk; **תעריף ישראל לא מאומת** (בגיליון מחירים להורדה) | כן, מספרים ישראליים (מקומי/נייד/חינם), ניוד נתמך לפי דף מדינה; דורש תעודת רישום עסק + הוכחת כתובת | **לא מאומת** | $0.002 לדקה, אחסון $0 | חתום Ed25519 | כן (Call Control) | WebRTC SDK, $0.002 לדקה | אנגלית | בינוני |
| **Vonage** | **לא מאומת** | **לא מאומת** (גיליון xls) | **לא מאומת** | דף Vonage: "אין הגבלה פרט ל-Local/Invalid CLI" | **לא מאומת** | **לא מאומת** | כן (Voice API) | כן | אנגלית | בינוני |
| **Zadarma** | חבילת Israel (Office): $33 לחודש ($28 בתשלום שנתי), כוללת 1,000 דק' לנייד ו-1,000 לקווי, מספר ישראלי אחד, 2,000MB הקלטות. הדף אומר גם "KZT" - **סתירה, יש לוודא מטבע** | לא מפורסם בדף החבילה | כן | מספר ישראלי חייב להיות ה-caller ID כדי לקבל דקות ישראליות | כן, הקלטה במרכזיה (PBX) | Webhook עם `Signature` | `GET /v1/request/callback/` | `GET /v1/webrtc/get_key/` (מפתח ל-widget, תקף 72 שעות) | אנגלית/רוסית | נמוך-בינוני |
| **Cloudonix** | **לא מאומת** | **לא מאומת** | **לא מאומת** | **לא מאומת** | CDR קיים; הקלטה **לא מאומת** | CDR ל-URL/WebSocket/S3 | כן (REST) | Web Client SDK | **לא מאומת** | בינוני |

(מקורות: ראו להלן. "לא מאומת" = לא מצאתי בדף חי.)

## פרטים לפי ספק

### Voicenter (ספק מומלץ) - הנתונים החשובים לקוד
- **Click-to-call:** `https://api.voicenter.com/ForwardDialer/click2call.aspx` (GET או POST JSON). פרמטרים: `action=call`, `phone` (רגל 1: שלוחה/נייד הנציג), `target` (רגל 2: הליד), `code` (טוקן הארגון מצוות Backoffice), `record=true|false` (ברירת מחדל false), `phonecallerid`, `targetcallerid`, `maxduration`, `language=he`, `var_*` (עד 10 משתנים מותאמים, מחזירים ב-CDR), `ignoredncstatus` (עוקף בדיקת "אל תתקשרו אלי" ישראלית - **לא להשתמש בלי החלטה משפטית**). תגובה: `ERRORCODE` (0 תקין, 1 פרמטרים, 2 שגיאה, 3 שלוחה offline, 4 חסומה), `ERRORMESSAGE`, `CALLID` (32 תווים). מקור: https://www.voicenter.com/API/click-to-call
- **Webhook ל-CDR (אחרי כל שיחה):** מסלולים JSON / XML-RPC / form. שדות: `ivruniqueid` (מזהה שיחה), `caller`, `callerPhone`, `target`, `did`, `type`, `direction`, `status`, `isAnswer`, `time` (Epoch, שעון ישראל), `duration` (שניות, בלי צלצול), `dialtime`, `actualCallDuration`, `representative_code`, `representative_name`, `record` (URL הקלטה), `price`, `queueid`, `OriginalIvrUniqueID`, ועוד. התגובה הנדרשת: HTTP 200 עם `{"Err":0,"Errdesc":""}`; אחרת Voicenter שולח שוב (מספר ניסיונות מוגדר אצלם). **התיעוד אינו מתאר חתימה או סוד משותף** - יש לאבטח באמצעות token סודי בנתיב/שאילתה של ה-URL ו/או רשימת IP. מקור: https://voicenter.com/API/CDR-Notification-System-API (נקרא דרך devwww.voicenter.com בגלל כשל SSL).
- **משיכה חוזרת (backfill/כיול):** `https://api.voicenter.com/hub/cdr/` (POST/GET), `code` או Bearer, IP חייב להיות מאושר ב-Cpanel, עד 30 בקשות לדקה ו-10,000 רשומות לבקשה. שדות: `CallID`, `CallerNumber`, `TargetNumber`, `Type`/`CdrType`, `Date`/`DateEpoch`, `Duration`, `RingTime`, `DialStatus` (ANSWER/BUSY/NOANSWER), `RecordURL`, `RecordExpect`. שימו לב: שמות השדות **שונים** בין ה-webhook (`ivruniqueid`, `record`) ל-API המשיכה (`CallID`, `RecordURL`). מקור: https://devwww.voicenter.com/API/Call-Log
- **הקלטות:** קישור URL בשדה; **לא מאומת** אם הקישור ציבורי או דורש אימות, ומה תקופת השמירה. יש להוריד ולשמור אצלנו מיד עם קבלת ה-webhook. **לא מאומת** אם ההקלטה דו-ערוצית.
- **אותו פורמט אצל Fireberry:** Fireberry מקבל CDR מכל מרכזית ענן באותם שמות שדות (`caller`, `target`, `time`, `duration`, `ivruniqueid`, `type`, `status`, `record`, `representative_*`), כלומר אפשר לקבל את אותם נתונים במקביל בזמן הגירה. מקור: https://www.fireberry.com/he/articles/sending-a-call-log-from-any-cloud-based-pbx
- **SDK:** קיימת חבילה `@voicenter-team/opensips-js` (ארגון GitHub: VoicenterTeam) לסופטפון WebRTC מבוסס OpenSIPS; לא מצאתי תיעוד רשמי ולכן **לא מאומת** היקף התמיכה. מחיר: לא פורסם באתר, צריך הצעה.

### Twilio
- מחירי ישראל (נראה 2026-11-20): יוצא מספר ישראלי: קווי $0.0294, נייד $0.0646; ממספר זר: $0.0659 / $0.1868. נכנס: מקומי $0.0107, נייד $0.0350, חינם $0.1344. מספרים לחודש: $5.50 / $15 / $22. הקלטה $0.0025/דק', אחסון $0.0005/דק'/חודש, תמלול $0.05/דק'. מקור: https://www.twilio.com/en-us/voice/pricing/il
- דף ה-guidelines של ישראל מזכיר רק toll-free, מציין Caller-ID מקומי כ"לא מובטח", ושאין שיחות לשירותי חירום. **לא מאומת** אפשרות לרכוש מספר מקומי ישראלי ולנייד. https://www.twilio.com/en-us/guidelines/il/israel--voice-guidelines---twilio
- הקלטה: `Recordings` עם `media_url`; הורדה בסיומת `.wav` או `.mp3` עם **HTTP Basic (API Key SID:Secret)** - אין קישור ציבורי. דו-ערוצי כברירת מחדל לשיחות רגילות (`RecordingChannels=dual`). Callback: `RecordingStatusCallback` עם `CallSid, RecordingSid, RecordingUrl, RecordingStatus, RecordingDuration, RecordingChannels` (אירועים: in-progress, completed, absent). מקור: https://www.twilio.com/docs/voice/api/recording
- חתימת webhook: `X-Twilio-Signature` = HMAC-SHA1 (בסיס64) של ה-URL המלא + פרמטרי ה-POST ממוינים, עם Auth Token (מידע כללי מהתיעוד של Twilio, **לא נקרא שוב היום**). שדות שיחה ב-StatusCallback: `CallSid, From, To, Direction, CallStatus, CallDuration, Timestamp` (**לא נקראו היום**).

### Telnyx
- מחירים: קול $0.002/דק' + SIP trunk (דוגמה: יוצא $0.005, נכנס $0.0032), הקלטה $0.002/דק', אחסון $0, WebRTC $0.002/דק'. תעריף ישראל נמצא בגיליון להורדה, **לא מאומת**. https://telnyx.com/pricing/voice-api
- מספרים ישראליים: מקומי מ-$3/חודש. דרישות: מקומי/לאומי - שם נציג חוקי, טלפון, שם חברה, תעודת רישום עסק, שימוש עסקי, הוכחת כתובת מ-3 החודשים האחרונים; נייד - שם חברה ואימייל; חינם - תעודת רישום. https://support.telnyx.com/en/articles/5466651-israel-did-requirements , https://telnyx.com/phone-numbers/israel
- Webhook: כותרות `Telnyx-Signature-Ed25519` + `Telnyx-Timestamp` (חתימת Ed25519 עם המפתח הציבורי של Telnyx; פרטי האימות בדף Webhook Fundamentals - לא נקרא במלואו). אירועים: `call.initiated`, `call.answered`, `call.hangup`, `call.recording.saved`. שדות מאומתים: `call_control_id`, `call_session_id`, `from`, `to`, `direction`. `call.recording.saved`: `recording_id`, `recording_started_at`, `recording_ended_at`, `download_urls` (mp3/wav, פגי תוקף, לא צוין משך), `public_recording_urls`, `channels`. שדות start/end/hangup_cause: **לא מאומת** מדפי התיעוד שנקראו. https://developers.telnyx.com/docs/voice/programmable-voice/voice-api-webhooks

### Zadarma
- API חינמי לכל חשבון. Callback: `GET /v1/request/callback/` (פרמטרים `from`, `to`, אופציונלי `sip`, `predicted`). חתימה: כותרת `Authorization: user_key:signature` (HMAC-SHA1 של נתיב + query ממוין + MD5, בסיס64). הקלטה: `GET /v1/pbx/record/request/` (`call_id`/`pbx_call_id`) מחזיר `link` זמני (180 עד 5,184,000 שניות, ברירת מחדל 1,800). אירועי webhook: `NOTIFY_START`, `NOTIFY_END`, `NOTIFY_OUT_START`, `NOTIFY_OUT_END`, `NOTIFY_RECORD`, `NOTIFY_ANSWER`, `NOTIFY_IVR`. שדות: `pbx_call_id`, `caller_id`, `called_did`/`destination`, `call_start`, `duration`, `disposition`, `status_code`, `is_recorded`, `call_id_with_rec`. חתימת webhook ב-header `Signature`: HMAC-SHA1 על שרשור שדות (למשל `caller_id+called_did+call_start`) עם ה-secret, בסיס64. מקורות: https://zadarma.com/support/api/ , https://zadarma.com/en/tariffs/plans/office/israel
- מתאים כחלופה זולה/ניסוי, אך לא ספק ישראלי ותמיכה לא בעברית.

### ספקים ישראליים נוספים
- **Cloudonix** (ספק CPaaS ישראלי): תיעוד חי ב-developers.cloudonix.com. CDR נשלח ל-`cdr-endpoint` (URL), WebSocket או S3, נוצר בסוף כל שיחה; click-to-call ב-REST עם Bearer; יש Web Client SDK (דורש HTTPS). מחירים, מספרים, הקלטות וחתימת webhook: **לא מאומת**. מקור: https://developers.cloudonix.com/Documentation/apiWorkflow/apiCallDetailReports
- **CommPeak**: יש תיעוד Click2Call/webhooks (https://docs.commpeak.com/docs/webhooks-management) אך לא בדקתי נוכחות/התאמה בישראל - לא ממליץ בלי בדיקה.
- Voicecenter, Cellact, Telzar, 019, Bezeq, IPCOM: **לא הצלחתי לאמת API ציבורי** ולכן לא נכללו בהשוואה.

## גישות חלופיות
- **Callback (גשר טלפון הנציג לליד):** הנציג לוחץ בכרטיס, הספק מחייג לנייד הנציג ואז לליד. שימוש בנייד של הנציג, בלי אפליקציה. זמין ב-Voicenter (`click2call.aspx`), Zadarma (`request/callback`), Twilio/Telnyx (יצירת שיחה בשתי רגליים). הקלטה והלוג מתקבלים מהספק.
- **SIM עצמית של הנציג, ללא מרכזיה:** שיחה רגילה מהנייד. אין הקלטה/CDR אוטומטיים בצד ה-CRM ולכן לא מתאים לדרישות.
- **סופטפון WebRTC:** חוויה הכי חלקה במסך, אבל תלוי בדפדפן, רשת, ומיקרופון; Voicenter (opensips-js), Twilio Voice SDK, Telnyx WebRTC SDK, Zadarma widget.
- **קישור `tel:`:** כבר מיידי, ללא עלות, ללא CDR/הקלטה. מתאים לשלב 1.

## הערות משפטיות (לא ייעוץ משפטי)
- **חוק האזנת סתר, תשל"ט-1979:** "האזנת סתר" מוגדרת כהאזנה ללא הסכמת אף אחד מהצדדים. הקלטת שיחה שאתה צד לה מותרת בדרך כלל, כי השתתפותך היא הסכמה (מקורות משניים). האיסורים העיקריים: האזנה לצד שלישי, וכן שימוש/מסירה של תוכן שהוקלט בניגוד לחוק. https://www.recordinglaw.com/world-laws/world-recording-laws/israel-recording-laws/ , https://fs.knesset.gov.il/9/law/9_lsr_208328.PDF
- **חוק הגנת הפרטיות:** גם הקלטה מותרת לפי חוק האזנת סתר עשויה להיות מוגבלת בעת שימוש/גילוי (מקורות משניים). **לא אימתתי** את נוסח החוק עצמו.
- **המלצה מעשית:** (1) הודעה בתחילת כל שיחה יוצאת: "השיחה מוקלטת לצורכי שירות ושיפור איכות" (קביעת טקסט כקלט שמושמע ע"י המרכזיה או ע"י הנציג); (2) להוסיף את ההקלטה והתמלול לתנאי השימוש/מדיניות פרטיות של המפרסם בטפסי הלידים; (3) לבדוק רשימת "אל תתקשרו אלי" בשיחות מכירה: Voicenter אפילו מציע בדיקת DNC בצד שלו (`ignoredncstatus` מציין שקיימת). **לא אימתתי** חובות מדויקות לשיחות מכירה יוצאות ולכן יש לאשר עם עו"ד.
- **שמירה ואבטחה:** תיקון 13 לחוק הגנת הפרטיות נכנס לתוקף ב-**14.8.2025** לפי רוב המקורות (מקור אחד כתב 6.8 - לא עקבי). האכיפה כבר החלה (עיצום ראשון בגובה 256,000 ש"ח לפי מאמר שיבולת מיולי 2026). הקלטות שיחה הן מידע אישי: מומלץ הצפנה במנוחה, גישה לפי תפקיד, תיעוד גישה, והגדרת תקופת שמירה (למשל 12 חודשים) ומחיקה אוטומטית. תקנות אבטחת מידע 2018 חלות; **לא אימתתי** רמת האבטחה הנדרשת מהקלטות. מקורות: https://www.shibolet.com/?p=23026 , https://www.rsm.global/israel/he/node/228

## מה צריך מטים
1. **אישור לכיוון Voicenter** (לא Twilio/Telnyx), והאם קיים חשבון Voicenter ישיר או שהוא עובר דרך Fireberry (השפעה על קבלת `code` ו-CDR).
2. **פרטי גישה:** `code` של API מ-Backoffice של Voicenter, אישור IP לשרתי Vercel (או endpoint ב-edge function עם IP קבוע, כי ה-IP של Vercel דינמי; נדרש פתרון לקריאות Call-Log, לא ל-webhook), ורשימת שלוחות/נציגים.
3. **שאלות לתמיכת Voicenter:** האם `record` URL ציבורי או חתום ומה תקופת השמירה? האם ההקלטה דו-ערוצית? האם יש חתימת webhook או רק IP? האם אפשר להוסיף webhook נוסף במקביל ל-Fireberry? מחיר.
4. **החלטה על הודעת הקלטה**: נוסח ומי משמיע (מרכזיה או נציג).
5. **תקופת שמירת הקלטות** (ברירת מחדל מוצעת: 12 חודשים).
6. **אישור עו"ד** על מסמך זה לפני הפעלה.
7. החלטה על הסופטפון: callback בשלב ראשון, או לבדוק `opensips-js` בהמשך.

</div>
