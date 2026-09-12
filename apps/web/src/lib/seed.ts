import type {
  Contact,
  Pipeline,
  Opportunity,
  Activity,
  Task,
  AppointmentType,
  Appointment,
  AvailabilityRule,
  LeadForm,
  Member,
  Automation,
  AutomationRun,
  Notification,
} from "./types";

// Generic pipeline stages — nothing real-estate-specific baked in, the
// point is that any business can rename/reorder these from the UI later.
export const seedPipelines: Pipeline[] = [
  {
    id: "pl-main",
    name: "פייפליין ראשי",
    stages: [
      { id: "st-new", name: "ליד חדש", winProbability: 5 },
      { id: "st-contacted", name: "יצרנו קשר", winProbability: 15 },
      { id: "st-qualified", name: "מתאים", winProbability: 35 },
      { id: "st-meeting", name: "נקבעה פגישה", winProbability: 60 },
      { id: "st-won", name: "נסגר", winProbability: 100 },
    ],
  },
];

export const seedContacts: Contact[] = [
  {
    id: "c-1",
    name: "דנה כהן",
    phone: "+972501112233",
    email: "dana@example.com",
    source: "פייסבוק",
    tags: ["חם"],
    fields: { תקציב: "1.8M", "סוג נכס": "דירת 4 חדרים" },
    createdAt: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "c-2",
    name: "יוסי לוי",
    phone: "+972502223344",
    email: "yossi@example.com",
    source: "אתר",
    tags: [],
    fields: { תקציב: "2.4M", "סוג נכס": "פנטהאוז" },
    createdAt: "2026-09-03T12:30:00.000Z",
  },
  {
    id: "c-3",
    name: "מיכל דהן",
    phone: "+972503334455",
    source: "הפניה",
    tags: ["דחוף"],
    fields: {},
    createdAt: "2026-09-05T15:00:00.000Z",
  },
];

export const seedOpportunities: Opportunity[] = [
  { id: "o-1", contactId: "c-1", pipelineId: "pl-main", stageId: "st-new", title: "דנה כהן — 4 חדרים", value: 1800000, createdAt: "2026-09-01T09:05:00.000Z" },
  { id: "o-2", contactId: "c-2", pipelineId: "pl-main", stageId: "st-qualified", title: "יוסי לוי — פנטהאוז", value: 2400000, createdAt: "2026-09-03T12:35:00.000Z" },
  { id: "o-3", contactId: "c-3", pipelineId: "pl-main", stageId: "st-meeting", title: "מיכל דהן", value: 0, createdAt: "2026-09-05T15:05:00.000Z" },
];

export const seedActivities: Activity[] = [
  { id: "a-1", contactId: "c-1", type: "note", text: "דיברנו בטלפון, מעוניינת לראות דירות באזור המרכז.", createdAt: "2026-09-02T10:00:00.000Z" },
];

export const seedFieldDefs: string[] = ["תקציב", "סוג נכס"];

export const seedTasks: Task[] = [
  { id: "t-1", title: "להתקשר לדנה כהן", contactId: "c-1", assignee: "אתה", dueDate: "2026-09-15", done: false, createdAt: "2026-09-10T08:00:00.000Z" },
  { id: "t-2", title: "לשלוח חומר ליוסי לוי", contactId: "c-2", assignee: "אתה", dueDate: "2026-09-12", done: false, createdAt: "2026-09-10T08:00:00.000Z" },
];

export const seedAppointmentTypes: AppointmentType[] = [
  { id: "at-1", name: "פגישת היכרות", durationMinutes: 30 },
  { id: "at-2", name: "הצגת נכס", durationMinutes: 60 },
];

export const seedAppointments: Appointment[] = [
  {
    id: "ap-1",
    contactId: "c-1",
    typeId: "at-2",
    title: "הצגת דירה לדנה כהן",
    startAt: "2026-09-16T10:00:00.000Z",
    endAt: "2026-09-16T11:00:00.000Z",
    createdAt: "2026-09-10T08:00:00.000Z",
  },
];

// Sunday–Thursday 09:00–17:00 — a generic default, editable from the calendar page.
export const seedAvailability: AvailabilityRule[] = [0, 1, 2, 3, 4].map((day) => ({
  day,
  startTime: "09:00",
  endTime: "17:00",
}));

export const seedForms: LeadForm[] = [
  {
    id: "form-1",
    name: "טופס יצירת קשר — אתר",
    fields: [
      { key: "name", label: "שם מלא", type: "text", required: true },
      { key: "phone", label: "טלפון", type: "phone", required: true },
      { key: "email", label: "אימייל", type: "email", required: false },
    ],
    createdAt: "2026-09-08T08:00:00.000Z",
  },
];

export const seedMembers: Member[] = [
  { id: "m-1", name: "אתה", email: "you@example.com", role: "owner", status: "active", createdAt: "2026-09-01T08:00:00.000Z" },
];

export const seedAutomations: Automation[] = [
  {
    id: "auto-1",
    name: "ברוכים הבאים לליד חדש",
    active: true,
    trigger: { type: "new_contact" },
    steps: [
      { id: "step-1", type: "send_message", message: "היי {{שם}}, תודה שפנית אלינו! נחזור אליך בקרוב." },
      { id: "step-2", type: "add_tag", tag: "ליד חדש" },
    ],
    createdAt: "2026-09-09T08:00:00.000Z",
  },
];

export const seedAutomationRuns: AutomationRun[] = [];

export const seedNotifications: Notification[] = [];
