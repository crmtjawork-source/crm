import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex, jsonb, integer, numeric, boolean, date, time } from "drizzle-orm/pg-core";

// A user can belong to several organizations (memberships), each with its
// own role — this is what lets us add agencies / sub-accounts later
// without touching the schema.
export const memberRole = pgEnum("member_role", ["owner", "admin", "agent"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Mirrors Supabase's auth.users — one row per authenticated user, created
// via a trigger on auth.users insert (added in the matching migration).
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // == auth.users.id
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId)]
);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: memberRole("role").notNull().default("agent"),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================= Leads (contacts) =============================

export const activityType = pgEnum("activity_type", ["note", "stage_change"]);
export const automationTriggerType = pgEnum("automation_trigger_type", ["new_contact", "stage_change", "tag_added", "appointment_booked"]);
export const automationStepType = pgEnum("automation_step_type", ["send_message", "wait", "add_tag", "notify"]);
export const formFieldType = pgEnum("form_field_type", ["text", "phone", "email", "textarea"]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  source: text("source"),
  tags: text("tags").array().notNull().default([]),
  fields: jsonb("fields").notNull().default({}),
  // Generated in SQL: normalize_phone(phone). Read-only from the app.
  phoneDigits: text("phone_digits"),
  // Suffix of the lead's personal booking link (template dynamic URL button).
  bookingToken: text("booking_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactFieldDefs = pgTable(
  "contact_field_defs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contact_field_defs_org_name_idx").on(t.orgId, t.name)]
);

// ============================== Pipeline ==============================

export const pipelines = pgTable("pipelines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stages = pgTable("stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  winProbability: integer("win_probability").notNull().default(10),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  pipelineId: uuid("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => stages.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  value: numeric("value").notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  type: activityType("type").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ================================ Tasks ================================

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  assignee: text("assignee"),
  dueDate: date("due_date"),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// =============================== Calendar ===============================

export const appointmentTypes = pgTable("appointment_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  publicBooking: boolean("public_booking").notNull().default(false), // offered on the lead's booking page
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  typeId: uuid("type_id").notNull().references(() => appointmentTypes.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Weekly recurring availability. day: 0 = Sunday .. 6 = Saturday.
export const availabilityRules = pgTable("availability_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  day: integer("day").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
});

// ============================== Lead forms ==============================

export const forms = pgTable("forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const formFields = pgTable("form_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  label: text("label").notNull(),
  type: formFieldType("type").notNull(),
  required: boolean("required").notNull().default(false),
  position: integer("position").notNull().default(0),
});

// ============================== Automations ==============================

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  triggerType: automationTriggerType("trigger_type").notNull(),
  triggerPipelineId: uuid("trigger_pipeline_id").references(() => pipelines.id, { onDelete: "cascade" }),
  triggerStageId: uuid("trigger_stage_id").references(() => stages.id, { onDelete: "cascade" }),
  triggerTag: text("trigger_tag"),
  triggerSource: text("trigger_source"), // e.g. "meta_lead_ads"; null = any source
  stopOnReply: boolean("stop_on_reply").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automationSteps = pgTable("automation_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  automationId: uuid("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  type: automationStepType("type").notNull(),
  message: text("message"),
  waitMinutes: integer("wait_minutes"),
  tag: text("tag"),
  notifyText: text("notify_text"),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
  templateName: text("template_name"),
  templateLanguage: text("template_language"),
  templateParams: text("template_params").array().notNull().default([]),
  templateButtonParam: text("template_button_param"),
  position: integer("position").notNull().default(0),
});

export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  automationId: uuid("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  stepsLog: text("steps_log").array().notNull().default([]),
  status: text("status").notNull().default("completed"), // running | waiting | completed | failed | cancelled
  nextStepPosition: integer("next_step_position").notNull().default(0),
  resumeAt: timestamp("resume_at", { withTimezone: true }),
});

// ============================== Notifications ==============================

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================ Messaging (WhatsApp) ============================

export const channelProvider = pgEnum("channel_provider", ["whatsapp_cloud"]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);
export const messageStatus = pgEnum("message_status", ["pending", "sent", "delivered", "read", "failed", "received"]);
export const messageOrigin = pgEnum("message_origin", ["crm", "automation", "phone_app", "history"]);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    provider: channelProvider("provider").notNull(),
    name: text("name").notNull(),
    externalId: text("external_id").notNull(), // WhatsApp phone_number_id
    wabaId: text("waba_id"),
    displayPhone: text("display_phone"),
    ownerMembershipId: uuid("owner_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    onboarding: text("onboarding").notNull().default("manual"), // manual | embedded_signup | coexistence
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    contactsSyncRequestedAt: timestamp("contacts_sync_requested_at", { withTimezone: true }),
    historySyncRequestedAt: timestamp("history_sync_requested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("channels_provider_external_id_key").on(t.provider, t.externalId)]
);

// Service-role only (RLS on, no policies).
export const channelCredentials = pgTable("channel_credentials", {
  channelId: uuid("channel_id").primaryKey().references(() => channels.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  registrationPin: text("registration_pin"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    externalThreadId: text("external_thread_id").notNull(), // customer's wa_id
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversations_channel_id_external_thread_id_key").on(t.channelId, t.externalThreadId)]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirection("direction").notNull(),
    origin: messageOrigin("origin"),
    type: text("type").notNull().default("text"),
    body: text("body"),
    payload: jsonb("payload").notNull().default({}),
    externalId: text("external_id"), // wamid
    status: messageStatus("status").notNull(),
    error: text("error"),
    sentBy: uuid("sent_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("messages_org_id_external_id_key").on(t.orgId, t.externalId)]
);

// Service-role only (RLS on, no policies). Raw payload persisted before 200.
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("received"), // received | processed | failed
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

// ================================ Lead Ads ================================

export const leadAdPages = pgTable("lead_ad_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  pageId: text("page_id").notNull().unique(),
  pageName: text("page_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Service-role only (RLS on, no policies).
export const leadAdPageCredentials = pgTable("lead_ad_page_credentials", {
  leadAdPageId: uuid("lead_ad_page_id").primaryKey().references(() => leadAdPages.id, { onDelete: "cascade" }),
  pageAccessToken: text("page_access_token").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadAdSubmissions = pgTable("lead_ad_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  leadgenId: text("leadgen_id").notNull().unique(),
  pageId: text("page_id").notNull(),
  formId: text("form_id"),
  adId: text("ad_id"),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  raw: jsonb("raw").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
