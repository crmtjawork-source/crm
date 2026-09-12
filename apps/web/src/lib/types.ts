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
  createdAt: string;
};

export type Stage = {
  id: string;
  name: string;
  winProbability: number; // 0-100, shown on the pipeline column header
};

export type Pipeline = {
  id: string;
  name: string;
  stages: Stage[];
};

export type Opportunity = {
  id: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  value: number;
  createdAt: string;
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
  createdAt: string;
};

export type AppointmentType = {
  id: string;
  name: string;
  durationMinutes: number;
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
  status: "active" | "invited";
  createdAt: string;
};

export type AutomationTriggerType = "new_contact" | "stage_change" | "tag_added";

export type AutomationTrigger = {
  type: AutomationTriggerType;
  pipelineId?: string; // stage_change
  stageId?: string; // stage_change
  tag?: string; // tag_added
};

export type AutomationStepType = "send_message" | "wait" | "add_tag" | "notify";

export type AutomationStep = {
  id: string;
  type: AutomationStepType;
  message?: string; // send_message
  waitMinutes?: number; // wait
  tag?: string; // add_tag
  notifyText?: string; // notify
};

export type Automation = {
  id: string;
  name: string;
  active: boolean;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  createdAt: string;
};

export type AutomationRun = {
  id: string;
  automationId: string;
  contactId: string;
  ranAt: string;
  stepsLog: string[];
};

export type Notification = {
  id: string;
  text: string;
  contactId?: string;
  createdAt: string;
  read: boolean;
};
