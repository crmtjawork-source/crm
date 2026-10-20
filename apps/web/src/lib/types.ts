// These shapes mirror the eventual Postgres/Drizzle schema on purpose
// (packages/db/src/schema.ts) — contacts.fields is a JSONB bag there too,
// so swapping the mock store for real queries later shouldn't touch the UI.

export type Contact = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  tags: string[];
  fields: Record<string, string>; // custom fields (budget, product type, ...)
  ownerEmail?: string; // assigned teammate (member or pending invite), by email
  campaignId?: string; // campaign that brought the lead (first touch)
  noAnswerCount: number; // "no answer" attempts so far
  bookingToken?: string; // the lead's personal booking link: /book/<token>
  handlingStatus?: string; // per-business list (lead_statuses), e.g. "ללא מענה 1"
  lastActivityAt: string; // arrived, left details again, or wrote on WhatsApp
  attribution: Record<string, string>; // raw tracking data: utm_*, click ids, ad/adset names…
  createdAt: string;
};

export type Stage = {
  id: string;
  name: string;
  winProbability: number; // 0-100, shown on the pipeline column header
  color?: string;
};

export type Pipeline = {
  id: string;
  name: string;
  stages: Stage[];
};

export type OpportunityStatus = "open" | "won" | "lost" | "abandoned";

export type Opportunity = {
  id: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  value: number;
  status: OpportunityStatus; // only "open" ones appear on the pipeline board
  lostReason?: string;
  closedAt?: string;
  createdAt: string;
  stageChangedAt: string; // last stage move — the board lists the latest first
};

// Unified per-contact timeline — matches the plan's "events, append-only"
// principle at local-state scale: notes are manual, stage_change is logged
// automatically by moveOpportunity().
export type Activity = {
  id: string;
  contactId: string;
  type: "note" | "stage_change";
  text: string;
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  contactId?: string;
  assignee?: string;
  dueDate?: string; // yyyy-mm-dd
  done: boolean;
  templateId?: string; // a message to send when doing the task (e.g. a meeting reminder)
  appointmentId?: string; // the meeting the message refers to
  createdAt: string;
};

export type AppointmentType = {
  id: string;
  name: string;
  durationMinutes: number;
  publicBooking: boolean; // leads can book it themselves via their personal link
  defaultOwnerEmail?: string; // gets meetings booked by leads that have no owner
};

export type Appointment = {
  id: string;
  contactId?: string;
  typeId: string;
  title: string;
  startAt: string; // ISO
  endAt: string; // ISO
  notes?: string;
  createdAt: string;
};

// Weekly recurring availability, e.g. { day: 0, startTime: "09:00", endTime: "17:00" }.
// day: 0 = Sunday .. 6 = Saturday.
export type AvailabilityRule = {
  day: number;
  startTime: string;
  endTime: string;
};

export type FormField = {
  key: string;
  label: string;
  type: "text" | "phone" | "email" | "textarea";
  required: boolean;
};

export type LeadForm = {
  id: string;
  name: string;
  fields: FormField[];
  createdAt: string;
};

export type MemberRole = "owner" | "admin" | "agent";

export type Member = {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  roleId?: string; // custom role (what they see); owners/admins see everything
  status: "active" | "invited";
  createdAt: string;
};

export type AutomationTriggerType =
  | "new_contact"
  | "stage_change"
  | "tag_added"
  | "appointment_booked"
  | "status_changed"
  | "document_viewed"
  | "document_signed"
  | "record_created"
  | "record_stage_changed"
  | "record_field_changed";

export type AutomationTrigger = {
  type: AutomationTriggerType;
  pipelineId?: string; // stage_change
  stageId?: string; // stage_change
  tag?: string; // tag_added
  source?: "meta_lead_ads"; // new_contact: only leads from this source; empty = any
  status?: string; // status_changed: fires when the handling status becomes this
  objectTypeId?: string; // record_*: which custom object
  field?: string; // record_field_changed: the field's key
  value?: string; // record_stage_changed / record_field_changed: the new value (empty = any change)
};

export type AutomationStepType = "send_message" | "wait" | "add_tag" | "notify" | "update_field" | "create_task";

export type AutomationStep = {
  id: string;
  type: AutomationStepType;
  message?: string; // send_message (free text, only inside the 24h window)
  channelId?: string; // send_message: which number sends it; empty = org default
  sender?: "channel" | "owner"; // owner = the lead owner's linked WhatsApp
  messageTemplateId?: string; // send_message: a ready-made message (message_templates)
  templateName?: string; // send_message: approved WhatsApp template
  templateLanguage?: string;
  templateParams?: string[]; // body {{1}}, {{2}}… — may use {{name}}, {{first_name}}, {{field:X}}
  templateButtonParam?: string; // suffix for the template's first (dynamic URL) button, e.g. {{booking_token}}
  waitMinutes?: number; // wait
  tag?: string; // add_tag
  notifyText?: string; // notify
  fieldKey?: string; // update_field: the record field to set
  fieldValue?: string; // update_field
  taskTitle?: string; // create_task
  taskDueDays?: number; // create_task: due this many days after the run
};

export type Automation = {
  id: string;
  name: string;
  active: boolean;
  stopOnReply: boolean;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  createdAt: string;
};

export type AutomationRunStatus = "running" | "waiting" | "completed" | "failed" | "cancelled";

export type AutomationRun = {
  id: string;
  automationId: string;
  contactId?: string;
  recordId?: string;
  ranAt: string;
  status: AutomationRunStatus;
  resumeAt?: string;
  stepsLog: string[];
};

export type Channel = {
  id: string;
  name: string;
  // whatsapp_cloud = official Cloud API number; green_api = a personal
  // WhatsApp linked through the unofficial Green-API gateway (QR scan).
  provider: "whatsapp_cloud" | "green_api" | "evolution";
  externalId: string; // phone_number_id, or Green-API idInstance
  status?: string; // green_api: authorized / notAuthorized / blocked …
  wabaId?: string;
  displayPhone?: string;
  ownerMembershipId?: string;
  isDefault: boolean;
  active: boolean;
  // coexistence = also live in the WhatsApp Business app on the phone
  onboarding: "manual" | "embedded_signup" | "coexistence";
  onboardedAt?: string;
  historySyncRequestedAt?: string;
  createdAt: string;
};

export type LeadAdPage = {
  id: string;
  pageId: string;
  pageName?: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  channelId: string;
  contactId: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  lastInboundAt?: string;
  unreadCount: number;
  createdAt: string;
};

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed" | "received";

export type Message = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  origin?: "crm" | "automation" | "phone_app" | "history";
  type: string;
  body?: string;
  status: MessageStatus;
  error?: string;
  createdAt: string;
};

export type Notification = {
  id: string;
  text: string;
  contactId?: string;
  createdAt: string;
  read: boolean;
};

// Marketing: where leads come from and what it cost. platform is free text
// with well-known values (see lib/attribution.ts PLATFORMS).
export type Campaign = {
  id: string;
  name: string;
  platform: string;
  agency?: string;
  externalId?: string;
  archived: boolean;
  createdAt: string;
};

export type CampaignSpend = {
  id: string;
  campaignId: string;
  day: string; // yyyy-mm-dd; monthly figures sit on the 1st
  amount: number;
  currency: string;
  source: string; // manual | csv | meta_api | google_api
};

// An intake URL (POST /api/public/leads/<token>) that agencies, Google lead
// forms, Zapier/Make or landing pages send leads to.
export type LeadSource = {
  id: string;
  name: string;
  token: string;
  defaultPlatform?: string;
  defaultAgency?: string;
  defaultCampaignId?: string;
  active: boolean;
  lastReceivedAt?: string;
  receivedCount: number;
  fieldMap: Record<string, string>; // incoming key → standard key or custom-field label ("-" drops it)
  lastPayload?: unknown; // last request body, for connecting a new sender
  lastError?: string;
  createdAt: string;
};

// A ready-made message; quickAction ties it to a lead-card button
// (see lib/templates.ts QUICK_ACTIONS).
export type MessageTemplate = {
  id: string;
  name: string;
  body: string;
  quickAction?: string;
  position: number;
  // A file sent with the text (caption) — image, video, PDF or voice note.
  attachment?: TemplateAttachment;
};

export type TemplateAttachment = { url: string; type: "image" | "video" | "gif" | "document" | "voice"; name?: string };

// A message queued to send later from an agent's linked WhatsApp (meeting reminders).
export type ScheduledMessage = {
  id: string;
  contactId: string;
  appointmentId?: string;
  label: string;
  sendAt: string;
  status: "pending" | "sending" | "sent" | "failed" | "cancelled";
  error?: string;
};

// One option of the business's handling-status list.
export type LeadStatus = { id: string; name: string; position: number; color?: string };

// Proposals / contracts signed online (see lib/documents.ts).
export type DocSection = { id: string; title: string; subtitle?: string; body: string };

export type DocCover = {
  title: string;
  preparedFor?: string;
  date?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  accentColor?: string;
  senderName?: string;
  senderEmail?: string;
};

export type DocumentTemplate = {
  id: string;
  name: string;
  title: string;
  logoUrl?: string;
  coverImageUrl?: string;
  accentColor: string;
  sections: DocSection[];
  signerFields: string[];
  expiryDays?: number;
  defaultValue?: number;
  position: number;
};

export type CrmDocument = {
  id: string;
  templateId?: string;
  contactId?: string;
  token: string;
  title: string;
  cover: DocCover;
  sections: DocSection[];
  signerFields: string[];
  value?: number;
  status: "sent" | "viewed" | "signed" | "declined" | "void";
  createdBy?: string;
  sentAt: string;
  expiresAt?: string;
  firstViewedAt?: string;
  lastViewedAt?: string;
  viewCount: number;
  viewSeconds: number;
  signedAt?: string;
  signature?: { name: string; image?: string; fields?: Record<string, string>; ip?: string; userAgent?: string; contentHash?: string };
  declinedAt?: string;
  declineReason?: string;
};

export type DocumentView = {
  id: string;
  startedAt: string;
  lastSeenAt: string;
  seconds: number;
  sections: Record<string, number>;
  device?: string;
};

// Custom objects (see lib/objects.ts).
export type FieldOption = { value: string; label: string; color?: string };

export type ObjectField = {
  id: string;
  objectTypeId: string;
  key: string;
  label: string;
  type: "text" | "long_text" | "number" | "currency" | "date" | "datetime" | "select" | "multi_select" | "checkbox" | "phone" | "email" | "url" | "relation" | "contact" | "user";
  options: FieldOption[];
  relationTypeId?: string;
  section?: string;
  required: boolean;
  showInList: boolean;
  position: number;
};

export type ObjectType = {
  id: string;
  name: string;
  singular: string;
  icon?: string;
  position: number;
  titleField?: string;
  stageField?: string;
  fields: ObjectField[];
};

export type CrmRecord = {
  id: string;
  objectTypeId: string;
  title: string;
  data: Record<string, string | number | boolean | string[] | null>;
  ownerEmail?: string;
  contactId?: string;
  createdAt: string;
  updatedAt: string;
};

// What a team member sees (enforced in the database).
export type Role = {
  id: string;
  name: string;
  leadsScope: "all" | "own_unassigned" | "own" | "none";
  meetingsScope: "all" | "own";
  tasksScope: "all" | "own";
  objectAccess: Record<string, "all" | "own" | "none">;
  features?: string[]; // menu screens; undefined = all
  position: number;
};
