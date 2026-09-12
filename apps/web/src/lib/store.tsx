"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabaseClient";
import type {
  Contact,
  Pipeline,
  Stage,
  Opportunity,
  Activity,
  Task,
  AppointmentType,
  Appointment,
  AvailabilityRule,
  LeadForm,
  FormField,
  Member,
  MemberRole,
  Automation,
  AutomationTriggerType,
  AutomationStep,
  AutomationRun,
  Notification,
} from "./types";

// Real Supabase-backed store. Every page reads/writes exclusively through
// useStore() — this is the module that used to be a localStorage mock; the
// shape of Store below is unchanged on purpose so pages didn't need to be
// rewritten, only the mutation methods became async (they now hit the DB).
//
// Pattern: fetch everything for the org once on mount into local state
// (a write-through cache), then every mutation does the Supabase write AND
// updates local state to match. This keeps reads (getContact,
// activitiesFor, etc.) synchronous for components while staying backed by
// a real, persisted, RLS-scoped database.

type State = {
  contacts: Contact[];
  pipelines: Pipeline[];
  opportunities: Opportunity[];
  activities: Activity[];
  tasks: Task[];
  fieldDefs: string[];
  appointmentTypes: AppointmentType[];
  appointments: Appointment[];
  availability: AvailabilityRule[];
  forms: LeadForm[];
  members: Member[];
  currentMemberId: string;
  automations: Automation[];
  automationRuns: AutomationRun[];
  notifications: Notification[];
};

const emptyState: State = {
  contacts: [],
  pipelines: [],
  opportunities: [],
  activities: [],
  tasks: [],
  fieldDefs: [],
  appointmentTypes: [],
  appointments: [],
  availability: [],
  forms: [],
  members: [],
  currentMemberId: "",
  automations: [],
  automationRuns: [],
  notifications: [],
};

type ContactPatch = Partial<Pick<Contact, "name" | "phone" | "email" | "source">>;
type OpportunityPatch = Partial<Pick<Opportunity, "title" | "value">>;
type ImportRow = { name: string; phone?: string; email?: string; source?: string; fields?: Record<string, string> };

type Store = State & {
  loading: boolean;
  addContact: (c: { name: string; phone?: string; email?: string; source?: string }) => Promise<Contact>;
  getContact: (id: string) => Contact | undefined;
  updateContact: (contactId: string, patch: ContactPatch) => Promise<void>;
  deleteContact: (contactId: string) => Promise<void>;
  updateContactFields: (contactId: string, fields: Record<string, string>) => Promise<void>;
  addTag: (contactId: string, tag: string) => Promise<void>;
  removeTag: (contactId: string, tag: string) => Promise<void>;
  importContacts: (rows: ImportRow[]) => Promise<number>;

  addOpportunity: (o: { contactId: string; pipelineId: string; stageId: string; title: string; value: number }) => Promise<Opportunity>;
  updateOpportunity: (opportunityId: string, patch: OpportunityPatch) => Promise<void>;
  deleteOpportunity: (opportunityId: string) => Promise<void>;
  moveOpportunity: (opportunityId: string, stageId: string) => Promise<void>;

  addNote: (contactId: string, text: string) => Promise<void>;
  activitiesFor: (contactId: string) => Activity[];

  addPipeline: (name: string) => Promise<Pipeline>;
  addStage: (pipelineId: string, name: string) => Promise<void>;
  renameStage: (pipelineId: string, stageId: string, name: string) => Promise<void>;
  deleteStage: (pipelineId: string, stageId: string) => Promise<{ ok: boolean; reason?: string }>;

  addTask: (t: { title: string; contactId?: string; assignee?: string; dueDate?: string }) => Promise<Task>;
  toggleTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;

  addFieldDef: (name: string) => Promise<void>;
  removeFieldDef: (name: string) => Promise<void>;

  addAppointmentType: (name: string, durationMinutes: number) => Promise<void>;
  addAppointment: (a: { contactId?: string; typeId: string; title: string; startAt: string; endAt: string; notes?: string }) => Promise<Appointment>;
  updateAppointment: (id: string, patch: Partial<Pick<Appointment, "title" | "startAt" | "endAt" | "notes">>) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  setAvailability: (rules: AvailabilityRule[]) => Promise<void>;

  addForm: (name: string, fields: FormField[]) => Promise<LeadForm>;
  updateForm: (id: string, patch: Partial<Pick<LeadForm, "name" | "fields">>) => Promise<void>;
  deleteForm: (id: string) => Promise<void>;
  submitForm: (formId: string, values: Record<string, string>) => Promise<Contact | null>;

  addMember: (name: string, email: string, role: MemberRole) => Promise<void>;
  updateMemberRole: (id: string, role: MemberRole) => Promise<void>;
  removeMember: (id: string) => Promise<void>;

  addAutomation: (a: { name: string; trigger: Automation["trigger"] }) => Promise<Automation>;
  updateAutomation: (id: string, patch: Partial<Pick<Automation, "name" | "trigger" | "active">>) => Promise<void>;
  deleteAutomation: (id: string) => Promise<void>;
  addAutomationStep: (automationId: string, step: Omit<AutomationStep, "id">) => Promise<void>;
  removeAutomationStep: (automationId: string, stepId: string) => Promise<void>;

  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

/* ============================= row <-> type mapping ============================= */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function mapContact(r: Row): Contact {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    source: r.source ?? undefined,
    tags: r.tags ?? [],
    fields: r.fields ?? {},
    createdAt: r.created_at,
  };
}

function mapStage(r: Row): Stage {
  return { id: r.id, name: r.name, winProbability: r.win_probability };
}

function mapPipeline(r: Row, stageRows: Row[]): Pipeline {
  return {
    id: r.id,
    name: r.name,
    stages: stageRows
      .filter((s) => s.pipeline_id === r.id)
      .sort((a, b) => a.position - b.position)
      .map(mapStage),
  };
}

function mapOpportunity(r: Row): Opportunity {
  return {
    id: r.id,
    contactId: r.contact_id,
    pipelineId: r.pipeline_id,
    stageId: r.stage_id,
    title: r.title,
    value: Number(r.value),
    createdAt: r.created_at,
  };
}

function mapActivity(r: Row): Activity {
  return { id: r.id, contactId: r.contact_id, type: r.type, text: r.text, createdAt: r.created_at };
}

function mapTask(r: Row): Task {
  return {
    id: r.id,
    title: r.title,
    contactId: r.contact_id ?? undefined,
    assignee: r.assignee ?? undefined,
    dueDate: r.due_date ?? undefined,
    done: r.done,
    createdAt: r.created_at,
  };
}

function mapAppointmentType(r: Row): AppointmentType {
  return { id: r.id, name: r.name, durationMinutes: r.duration_minutes };
}

function mapAppointment(r: Row): Appointment {
  return {
    id: r.id,
    contactId: r.contact_id ?? undefined,
    typeId: r.type_id,
    title: r.title,
    startAt: r.start_at,
    endAt: r.end_at,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  };
}

function mapAvailability(r: Row): AvailabilityRule {
  return { day: r.day, startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5) };
}

function mapFormField(r: Row): FormField {
  return { key: r.key, label: r.label, type: r.type, required: r.required };
}

function mapForm(r: Row, fieldRows: Row[]): LeadForm {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    fields: fieldRows
      .filter((f) => f.form_id === r.id)
      .sort((a, b) => a.position - b.position)
      .map(mapFormField),
  };
}

function mapAutomationStep(r: Row): AutomationStep {
  return {
    id: r.id,
    type: r.type,
    message: r.message ?? undefined,
    waitMinutes: r.wait_minutes ?? undefined,
    tag: r.tag ?? undefined,
    notifyText: r.notify_text ?? undefined,
  };
}

function mapAutomation(r: Row, stepRows: Row[]): Automation {
  return {
    id: r.id,
    name: r.name,
    active: r.active,
    trigger: {
      type: r.trigger_type,
      pipelineId: r.trigger_pipeline_id ?? undefined,
      stageId: r.trigger_stage_id ?? undefined,
      tag: r.trigger_tag ?? undefined,
    },
    steps: stepRows
      .filter((s) => s.automation_id === r.id)
      .sort((a, b) => a.position - b.position)
      .map(mapAutomationStep),
    createdAt: r.created_at,
  };
}

function mapAutomationRun(r: Row): AutomationRun {
  return { id: r.id, automationId: r.automation_id, contactId: r.contact_id, ranAt: r.ran_at, stepsLog: r.steps_log ?? [] };
}

function mapNotification(r: Row): Notification {
  return { id: r.id, text: r.text, contactId: r.contact_id ?? undefined, createdAt: r.created_at, read: r.read };
}

function describeAutomationStep(step: AutomationStep): string {
  switch (step.type) {
    case "send_message":
      return `נשלחה הודעה (מדומה): "${step.message ?? ""}"`;
    case "wait":
      return `המתנה מדומה של ${step.waitMinutes ?? 0} דקות`;
    case "add_tag":
      return `הוספת תגית "${step.tag ?? ""}"`;
    case "notify":
      return `התראה: "${step.notifyText ?? ""}"`;
  }
}

export function StoreProvider({
  orgId,
  userId,
  children,
}: {
  orgId: string;
  userId: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<State>(emptyState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      const [
        contactsRes,
        pipelinesRes,
        stagesRes,
        opportunitiesRes,
        activitiesRes,
        tasksRes,
        fieldDefsRes,
        appointmentTypesRes,
        appointmentsRes,
        availabilityRes,
        formsRes,
        formFieldsRes,
        membershipsRes,
        invitationsRes,
        automationsRes,
        automationStepsRes,
        automationRunsRes,
        notificationsRes,
      ] = await Promise.all([
        supabase.from("contacts").select("*").order("created_at"),
        supabase.from("pipelines").select("*").order("created_at"),
        supabase.from("stages").select("*"),
        supabase.from("opportunities").select("*"),
        supabase.from("activities").select("*"),
        supabase.from("tasks").select("*").order("created_at"),
        supabase.from("contact_field_defs").select("*"),
        supabase.from("appointment_types").select("*"),
        supabase.from("appointments").select("*"),
        supabase.from("availability_rules").select("*"),
        supabase.from("forms").select("*").order("created_at"),
        supabase.from("form_fields").select("*"),
        supabase.from("memberships").select("id, user_id, role, created_at, users(email, full_name)"),
        supabase.from("invitations").select("*"),
        supabase.from("automations").select("*").order("created_at"),
        supabase.from("automation_steps").select("*"),
        supabase.from("automation_runs").select("*"),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      ]);

      if (cancelled) return;

      const stageRows = stagesRes.data ?? [];
      const formFieldRows = formFieldsRes.data ?? [];
      const automationStepRows = automationStepsRes.data ?? [];

      const members: Member[] = [
        ...(membershipsRes.data ?? []).map(
          (m: Row): Member => ({
            id: `mem:${m.id}`,
            name: m.users?.full_name || m.users?.email || "—",
            email: m.users?.email ?? "",
            role: m.role as MemberRole,
            status: "active",
            createdAt: m.created_at,
          })
        ),
        ...(invitationsRes.data ?? []).map(
          (inv: Row): Member => ({
            id: `inv:${inv.id}`,
            name: inv.name || inv.email,
            email: inv.email,
            role: inv.role as MemberRole,
            status: "invited",
            createdAt: inv.created_at,
          })
        ),
      ];
      const myMembership = (membershipsRes.data ?? []).find((m: Row) => m.user_id === userId);

      setState({
        contacts: (contactsRes.data ?? []).map(mapContact),
        pipelines: (pipelinesRes.data ?? []).map((p: Row) => mapPipeline(p, stageRows)),
        opportunities: (opportunitiesRes.data ?? []).map(mapOpportunity),
        activities: (activitiesRes.data ?? []).map(mapActivity),
        tasks: (tasksRes.data ?? []).map(mapTask),
        fieldDefs: (fieldDefsRes.data ?? []).map((r: Row) => r.name),
        appointmentTypes: (appointmentTypesRes.data ?? []).map(mapAppointmentType),
        appointments: (appointmentsRes.data ?? []).map(mapAppointment),
        availability: (availabilityRes.data ?? []).map(mapAvailability),
        forms: (formsRes.data ?? []).map((f: Row) => mapForm(f, formFieldRows)),
        members,
        currentMemberId: myMembership ? `mem:${myMembership.id}` : "",
        automations: (automationsRes.data ?? []).map((a: Row) => mapAutomation(a, automationStepRows)),
        automationRuns: (automationRunsRes.data ?? []).map(mapAutomationRun),
        notifications: (notificationsRes.data ?? []).map(mapNotification),
      });
      setLoading(false);
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId]);

  // Automations: no real messaging connection yet, so send_message/wait are
  // logged-only; add_tag and notify perform their real effect. Runs against
  // the already-loaded `automations` list (avoids a re-query per trigger).
  async function runAutomations(
    automations: Automation[],
    type: AutomationTriggerType,
    contactId: string,
    ctx: { pipelineId?: string; stageId?: string; tag?: string }
  ): Promise<{ extraTags: string[]; activities: Activity[]; notifications: Notification[]; runs: AutomationRun[] }> {
    const matched = automations.filter((a) => {
      if (!a.active || a.trigger.type !== type) return false;
      if (a.trigger.pipelineId && a.trigger.pipelineId !== ctx.pipelineId) return false;
      if (a.trigger.stageId && a.trigger.stageId !== ctx.stageId) return false;
      if (a.trigger.tag && a.trigger.tag !== ctx.tag) return false;
      return true;
    });
    if (matched.length === 0) return { extraTags: [], activities: [], notifications: [], runs: [] };

    const extraTags: string[] = [];
    const activities: Activity[] = [];
    const notifications: Notification[] = [];
    const runs: AutomationRun[] = [];

    for (const automation of matched) {
      const stepsLog = automation.steps.map(describeAutomationStep);
      automation.steps.forEach((step) => {
        if (step.type === "add_tag" && step.tag) extraTags.push(step.tag);
      });

      const { data: activityRow } = await supabase
        .from("activities")
        .insert({
          org_id: orgId,
          contact_id: contactId,
          type: "note",
          text: `🤖 אוטומציה "${automation.name}" הופעלה: ${stepsLog.join(" ← ")}`,
        })
        .select()
        .single();
      if (activityRow) activities.push(mapActivity(activityRow));

      const { data: runRow } = await supabase
        .from("automation_runs")
        .insert({ org_id: orgId, automation_id: automation.id, contact_id: contactId, steps_log: stepsLog })
        .select()
        .single();
      if (runRow) runs.push(mapAutomationRun(runRow));

      for (const step of automation.steps) {
        if (step.type !== "notify") continue;
        const { data: notifRow } = await supabase
          .from("notifications")
          .insert({ org_id: orgId, contact_id: contactId, text: step.notifyText || `אוטומציה "${automation.name}" רצה` })
          .select()
          .single();
        if (notifRow) notifications.push(mapNotification(notifRow));
      }
    }

    return { extraTags, activities, notifications, runs };
  }

  const getContact: Store["getContact"] = (id) => state.contacts.find((c) => c.id === id);

  const activitiesFor: Store["activitiesFor"] = (contactId) =>
    state.activities.filter((a) => a.contactId === contactId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const addContact: Store["addContact"] = async (c) => {
    const { data, error } = await supabase
      .from("contacts")
      .insert({ org_id: orgId, name: c.name, phone: c.phone, email: c.email, source: c.source })
      .select()
      .single();
    if (error || !data) throw error;
    let contact = mapContact(data);

    const { extraTags, activities, notifications, runs } = await runAutomations(state.automations, "new_contact", contact.id, {});
    if (extraTags.length) {
      const { data: updated } = await supabase
        .from("contacts")
        .update({ tags: extraTags })
        .eq("id", contact.id)
        .select()
        .single();
      if (updated) contact = mapContact(updated);
    }

    setState((s) => ({
      ...s,
      contacts: [...s.contacts, contact],
      activities: [...s.activities, ...activities],
      notifications: [...notifications, ...s.notifications],
      automationRuns: [...s.automationRuns, ...runs],
    }));
    return contact;
  };

  const updateContact: Store["updateContact"] = async (contactId, patch) => {
    const { data } = await supabase.from("contacts").update(patch).eq("id", contactId).select().single();
    if (!data) return;
    const updated = mapContact(data);
    setState((s) => ({ ...s, contacts: s.contacts.map((c) => (c.id === contactId ? updated : c)) }));
  };

  const deleteContact: Store["deleteContact"] = async (contactId) => {
    await supabase.from("contacts").delete().eq("id", contactId);
    setState((s) => ({
      ...s,
      contacts: s.contacts.filter((c) => c.id !== contactId),
      opportunities: s.opportunities.filter((o) => o.contactId !== contactId),
      activities: s.activities.filter((a) => a.contactId !== contactId),
      tasks: s.tasks.map((t) => (t.contactId === contactId ? { ...t, contactId: undefined } : t)),
    }));
    // opportunities/activities cascade via ON DELETE CASCADE; tasks unlink via ON DELETE SET NULL
  };

  const updateContactFields: Store["updateContactFields"] = async (contactId, fields) => {
    const contact = state.contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const mergedFields = { ...contact.fields, ...fields };
    const { data } = await supabase.from("contacts").update({ fields: mergedFields }).eq("id", contactId).select().single();
    const newDefNames = Object.keys(fields).filter((k) => !state.fieldDefs.includes(k));
    if (newDefNames.length) {
      await supabase.from("contact_field_defs").upsert(
        newDefNames.map((name) => ({ org_id: orgId, name })),
        { onConflict: "org_id,name", ignoreDuplicates: true }
      );
    }
    setState((s) => ({
      ...s,
      contacts: data ? s.contacts.map((c) => (c.id === contactId ? mapContact(data) : c)) : s.contacts,
      fieldDefs: Array.from(new Set([...s.fieldDefs, ...newDefNames])),
    }));
  };

  const addTag: Store["addTag"] = async (contactId, tag) => {
    const contact = state.contacts.find((c) => c.id === contactId);
    if (!contact || contact.tags.includes(tag)) return;

    const { extraTags, activities, notifications, runs } = await runAutomations(state.automations, "tag_added", contactId, { tag });
    const newTags = Array.from(new Set([...contact.tags, tag, ...extraTags]));
    const { data } = await supabase.from("contacts").update({ tags: newTags }).eq("id", contactId).select().single();

    setState((s) => ({
      ...s,
      contacts: data ? s.contacts.map((c) => (c.id === contactId ? mapContact(data) : c)) : s.contacts,
      activities: [...s.activities, ...activities],
      notifications: [...notifications, ...s.notifications],
      automationRuns: [...s.automationRuns, ...runs],
    }));
  };

  const removeTag: Store["removeTag"] = async (contactId, tag) => {
    const contact = state.contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const newTags = contact.tags.filter((t) => t !== tag);
    const { data } = await supabase.from("contacts").update({ tags: newTags }).eq("id", contactId).select().single();
    if (data) setState((s) => ({ ...s, contacts: s.contacts.map((c) => (c.id === contactId ? mapContact(data) : c)) }));
  };

  const importContacts: Store["importContacts"] = async (rows) => {
    const validRows = rows.filter((r) => r.name?.trim());
    if (validRows.length === 0) return 0;
    const { data, error } = await supabase
      .from("contacts")
      .insert(
        validRows.map((r) => ({
          org_id: orgId,
          name: r.name,
          phone: r.phone,
          email: r.email,
          source: r.source ?? "ייבוא CSV",
          fields: r.fields ?? {},
        }))
      )
      .select();
    if (error || !data) throw error;
    const newContacts = data.map(mapContact);
    const newFieldNames = newContacts.flatMap((c) => Object.keys(c.fields)).filter((k) => !state.fieldDefs.includes(k));
    if (newFieldNames.length) {
      await supabase.from("contact_field_defs").upsert(
        Array.from(new Set(newFieldNames)).map((name) => ({ org_id: orgId, name })),
        { onConflict: "org_id,name", ignoreDuplicates: true }
      );
    }
    setState((s) => ({
      ...s,
      contacts: [...s.contacts, ...newContacts],
      fieldDefs: Array.from(new Set([...s.fieldDefs, ...newFieldNames])),
    }));
    return newContacts.length;
  };

  const addOpportunity: Store["addOpportunity"] = async (o) => {
    const { data, error } = await supabase
      .from("opportunities")
      .insert({ org_id: orgId, contact_id: o.contactId, pipeline_id: o.pipelineId, stage_id: o.stageId, title: o.title, value: o.value })
      .select()
      .single();
    if (error || !data) throw error;
    const opp = mapOpportunity(data);
    setState((s) => ({ ...s, opportunities: [...s.opportunities, opp] }));
    return opp;
  };

  const updateOpportunity: Store["updateOpportunity"] = async (opportunityId, patch) => {
    const { data } = await supabase.from("opportunities").update(patch).eq("id", opportunityId).select().single();
    if (data) setState((s) => ({ ...s, opportunities: s.opportunities.map((o) => (o.id === opportunityId ? mapOpportunity(data) : o)) }));
  };

  const deleteOpportunity: Store["deleteOpportunity"] = async (opportunityId) => {
    await supabase.from("opportunities").delete().eq("id", opportunityId);
    setState((s) => ({ ...s, opportunities: s.opportunities.filter((o) => o.id !== opportunityId) }));
  };

  const moveOpportunity: Store["moveOpportunity"] = async (opportunityId, stageId) => {
    const opp = state.opportunities.find((o) => o.id === opportunityId);
    if (!opp || opp.stageId === stageId) return;
    const pipeline = state.pipelines.find((p) => p.id === opp.pipelineId);
    const stageName = pipeline?.stages.find((st) => st.id === stageId)?.name ?? stageId;

    const { data } = await supabase.from("opportunities").update({ stage_id: stageId }).eq("id", opportunityId).select().single();

    const { data: activityRow } = await supabase
      .from("activities")
      .insert({ org_id: orgId, contact_id: opp.contactId, type: "stage_change", text: `הועבר לשלב "${stageName}"` })
      .select()
      .single();

    const { extraTags, activities, notifications, runs } = await runAutomations(state.automations, "stage_change", opp.contactId, {
      pipelineId: opp.pipelineId,
      stageId,
    });

    let updatedContact: Contact | null = null;
    if (extraTags.length) {
      const contact = state.contacts.find((c) => c.id === opp.contactId);
      if (contact) {
        const newTags = Array.from(new Set([...contact.tags, ...extraTags]));
        const { data: cData } = await supabase.from("contacts").update({ tags: newTags }).eq("id", contact.id).select().single();
        if (cData) updatedContact = mapContact(cData);
      }
    }

    setState((s) => ({
      ...s,
      opportunities: data ? s.opportunities.map((o) => (o.id === opportunityId ? mapOpportunity(data) : o)) : s.opportunities,
      contacts: updatedContact ? s.contacts.map((c) => (c.id === updatedContact!.id ? updatedContact! : c)) : s.contacts,
      activities: [...s.activities, ...(activityRow ? [mapActivity(activityRow)] : []), ...activities],
      notifications: [...notifications, ...s.notifications],
      automationRuns: [...s.automationRuns, ...runs],
    }));
  };

  const addNote: Store["addNote"] = async (contactId, text) => {
    const { data } = await supabase.from("activities").insert({ org_id: orgId, contact_id: contactId, type: "note", text }).select().single();
    if (data) setState((s) => ({ ...s, activities: [...s.activities, mapActivity(data)] }));
  };

  const addPipeline: Store["addPipeline"] = async (name) => {
    const { data: pipelineRow, error } = await supabase.from("pipelines").insert({ org_id: orgId, name }).select().single();
    if (error || !pipelineRow) throw error;
    const { data: stageRow } = await supabase
      .from("stages")
      .insert({ pipeline_id: pipelineRow.id, name: "חדש", win_probability: 10, position: 0 })
      .select()
      .single();
    const pipeline: Pipeline = { id: pipelineRow.id, name: pipelineRow.name, stages: stageRow ? [mapStage(stageRow)] : [] };
    setState((s) => ({ ...s, pipelines: [...s.pipelines, pipeline] }));
    return pipeline;
  };

  const addStage: Store["addStage"] = async (pipelineId, name) => {
    const pipeline = state.pipelines.find((p) => p.id === pipelineId);
    const position = pipeline ? pipeline.stages.length : 0;
    const { data } = await supabase
      .from("stages")
      .insert({ pipeline_id: pipelineId, name, win_probability: 10, position })
      .select()
      .single();
    if (!data) return;
    const stage = mapStage(data);
    setState((s) => ({
      ...s,
      pipelines: s.pipelines.map((p) => (p.id === pipelineId ? { ...p, stages: [...p.stages, stage] } : p)),
    }));
  };

  const renameStage: Store["renameStage"] = async (pipelineId, stageId, name) => {
    await supabase.from("stages").update({ name }).eq("id", stageId);
    setState((s) => ({
      ...s,
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId ? { ...p, stages: p.stages.map((st) => (st.id === stageId ? { ...st, name } : st)) } : p
      ),
    }));
  };

  const deleteStage: Store["deleteStage"] = async (pipelineId, stageId) => {
    const hasOpportunities = state.opportunities.some((o) => o.pipelineId === pipelineId && o.stageId === stageId);
    if (hasOpportunities) return { ok: false, reason: "יש הזדמנויות פתוחות בשלב הזה — צריך להעביר אותן קודם." };
    const { error } = await supabase.from("stages").delete().eq("id", stageId);
    if (error) return { ok: false, reason: "אין הרשאה למחוק שלב זה." };
    setState((s) => ({
      ...s,
      pipelines: s.pipelines.map((p) => (p.id === pipelineId ? { ...p, stages: p.stages.filter((st) => st.id !== stageId) } : p)),
    }));
    return { ok: true };
  };

  const addTask: Store["addTask"] = async (t) => {
    const { data, error } = await supabase
      .from("tasks")
      .insert({ org_id: orgId, title: t.title, contact_id: t.contactId, assignee: t.assignee, due_date: t.dueDate })
      .select()
      .single();
    if (error || !data) throw error;
    const task = mapTask(data);
    setState((s) => ({ ...s, tasks: [...s.tasks, task] }));
    return task;
  };

  const toggleTask: Store["toggleTask"] = async (taskId) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const { data } = await supabase.from("tasks").update({ done: !task.done }).eq("id", taskId).select().single();
    if (data) setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === taskId ? mapTask(data) : t)) }));
  };

  const deleteTask: Store["deleteTask"] = async (taskId) => {
    await supabase.from("tasks").delete().eq("id", taskId);
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) }));
  };

  const addFieldDef: Store["addFieldDef"] = async (name) => {
    if (state.fieldDefs.includes(name)) return;
    await supabase.from("contact_field_defs").insert({ org_id: orgId, name });
    setState((s) => (s.fieldDefs.includes(name) ? s : { ...s, fieldDefs: [...s.fieldDefs, name] }));
  };

  const removeFieldDef: Store["removeFieldDef"] = async (name) => {
    await supabase.from("contact_field_defs").delete().eq("org_id", orgId).eq("name", name);
    setState((s) => ({ ...s, fieldDefs: s.fieldDefs.filter((f) => f !== name) }));
  };

  const addAppointmentType: Store["addAppointmentType"] = async (name, durationMinutes) => {
    const { data } = await supabase
      .from("appointment_types")
      .insert({ org_id: orgId, name, duration_minutes: durationMinutes })
      .select()
      .single();
    if (data) setState((s) => ({ ...s, appointmentTypes: [...s.appointmentTypes, mapAppointmentType(data)] }));
  };

  const addAppointment: Store["addAppointment"] = async (a) => {
    const { data, error } = await supabase
      .from("appointments")
      .insert({ org_id: orgId, contact_id: a.contactId, type_id: a.typeId, title: a.title, start_at: a.startAt, end_at: a.endAt, notes: a.notes })
      .select()
      .single();
    if (error || !data) throw error;
    const appointment = mapAppointment(data);
    setState((s) => ({ ...s, appointments: [...s.appointments, appointment] }));
    return appointment;
  };

  const updateAppointment: Store["updateAppointment"] = async (id, patch) => {
    const payload: Row = {};
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.startAt !== undefined) payload.start_at = patch.startAt;
    if (patch.endAt !== undefined) payload.end_at = patch.endAt;
    if (patch.notes !== undefined) payload.notes = patch.notes;
    const { data } = await supabase.from("appointments").update(payload).eq("id", id).select().single();
    if (data) setState((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? mapAppointment(data) : a)) }));
  };

  const deleteAppointment: Store["deleteAppointment"] = async (id) => {
    await supabase.from("appointments").delete().eq("id", id);
    setState((s) => ({ ...s, appointments: s.appointments.filter((a) => a.id !== id) }));
  };

  const setAvailability: Store["setAvailability"] = async (rules) => {
    await supabase.from("availability_rules").delete().eq("org_id", orgId);
    if (rules.length) {
      await supabase
        .from("availability_rules")
        .insert(rules.map((r) => ({ org_id: orgId, day: r.day, start_time: r.startTime, end_time: r.endTime })));
    }
    setState((s) => ({ ...s, availability: rules }));
  };

  const addForm: Store["addForm"] = async (name, fields) => {
    const { data: formRow, error } = await supabase.from("forms").insert({ org_id: orgId, name }).select().single();
    if (error || !formRow) throw error;
    const { data: fieldRows } = await supabase
      .from("form_fields")
      .insert(fields.map((f, i) => ({ form_id: formRow.id, key: f.key, label: f.label, type: f.type, required: f.required, position: i })))
      .select();
    const form = mapForm(formRow, fieldRows ?? []);
    setState((s) => ({ ...s, forms: [...s.forms, form] }));
    return form;
  };

  const updateForm: Store["updateForm"] = async (id, patch) => {
    if (patch.name !== undefined) await supabase.from("forms").update({ name: patch.name }).eq("id", id);
    if (patch.fields !== undefined) {
      await supabase.from("form_fields").delete().eq("form_id", id);
      await supabase
        .from("form_fields")
        .insert(patch.fields.map((f, i) => ({ form_id: id, key: f.key, label: f.label, type: f.type, required: f.required, position: i })));
    }
    setState((s) => ({ ...s, forms: s.forms.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  };

  const deleteForm: Store["deleteForm"] = async (id) => {
    await supabase.from("forms").delete().eq("id", id);
    setState((s) => ({ ...s, forms: s.forms.filter((f) => f.id !== id) }));
  };

  const submitForm: Store["submitForm"] = async (formId, values) => {
    const form = state.forms.find((f) => f.id === formId);
    if (!form) return null;
    const nameField = form.fields.find((f) => f.key === "name");
    const name = (nameField ? values[nameField.key] : values["name"])?.trim();
    if (!name) return null;
    const phoneField = form.fields.find((f) => f.type === "phone");
    const emailField = form.fields.find((f) => f.type === "email");
    const extraFields: Record<string, string> = {};
    form.fields.forEach((f) => {
      if (f === nameField || f === phoneField || f === emailField) return;
      if (values[f.key]?.trim()) extraFields[f.label] = values[f.key].trim();
    });
    const contact = await addContact({
      name,
      phone: phoneField ? values[phoneField.key]?.trim() || undefined : undefined,
      email: emailField ? values[emailField.key]?.trim() || undefined : undefined,
      source: form.name,
    });
    if (Object.keys(extraFields).length) await updateContactFields(contact.id, extraFields);
    return contact;
  };

  const addMember: Store["addMember"] = async (name, email, role) => {
    const { data } = await supabase
      .from("invitations")
      .insert({ org_id: orgId, email, role, name, invited_by: userId })
      .select()
      .single();
    if (data) {
      setState((s) => ({
        ...s,
        members: [
          ...s.members,
          { id: `inv:${data.id}`, name: data.name || data.email, email: data.email, role: data.role, status: "invited", createdAt: data.created_at },
        ],
      }));
    }
  };

  const updateMemberRole: Store["updateMemberRole"] = async (id, role) => {
    if (id.startsWith("mem:")) {
      await supabase.from("memberships").update({ role }).eq("id", id.slice(4));
    } else if (id.startsWith("inv:")) {
      await supabase.from("invitations").update({ role }).eq("id", id.slice(4));
    }
    setState((s) => ({ ...s, members: s.members.map((m) => (m.id === id ? { ...m, role } : m)) }));
  };

  const removeMember: Store["removeMember"] = async (id) => {
    if (id === state.currentMemberId) return;
    if (id.startsWith("mem:")) {
      await supabase.from("memberships").delete().eq("id", id.slice(4));
    } else if (id.startsWith("inv:")) {
      await supabase.from("invitations").delete().eq("id", id.slice(4));
    }
    setState((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) }));
  };

  const addAutomation: Store["addAutomation"] = async (a) => {
    const { data, error } = await supabase
      .from("automations")
      .insert({
        org_id: orgId,
        name: a.name,
        active: true,
        trigger_type: a.trigger.type,
        trigger_pipeline_id: a.trigger.pipelineId,
        trigger_stage_id: a.trigger.stageId,
        trigger_tag: a.trigger.tag,
      })
      .select()
      .single();
    if (error || !data) throw error;
    const automation = mapAutomation(data, []);
    setState((s) => ({ ...s, automations: [...s.automations, automation] }));
    return automation;
  };

  const updateAutomation: Store["updateAutomation"] = async (id, patch) => {
    const payload: Row = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.active !== undefined) payload.active = patch.active;
    if (patch.trigger !== undefined) {
      payload.trigger_type = patch.trigger.type;
      payload.trigger_pipeline_id = patch.trigger.pipelineId ?? null;
      payload.trigger_stage_id = patch.trigger.stageId ?? null;
      payload.trigger_tag = patch.trigger.tag ?? null;
    }
    await supabase.from("automations").update(payload).eq("id", id);
    setState((s) => ({ ...s, automations: s.automations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  };

  const deleteAutomation: Store["deleteAutomation"] = async (id) => {
    await supabase.from("automations").delete().eq("id", id);
    setState((s) => ({ ...s, automations: s.automations.filter((a) => a.id !== id) }));
  };

  const addAutomationStep: Store["addAutomationStep"] = async (automationId, step) => {
    const automation = state.automations.find((a) => a.id === automationId);
    const position = automation ? automation.steps.length : 0;
    const { data } = await supabase
      .from("automation_steps")
      .insert({
        automation_id: automationId,
        type: step.type,
        message: step.message,
        wait_minutes: step.waitMinutes,
        tag: step.tag,
        notify_text: step.notifyText,
        position,
      })
      .select()
      .single();
    if (!data) return;
    const newStep = mapAutomationStep(data);
    setState((s) => ({
      ...s,
      automations: s.automations.map((a) => (a.id === automationId ? { ...a, steps: [...a.steps, newStep] } : a)),
    }));
  };

  const removeAutomationStep: Store["removeAutomationStep"] = async (automationId, stepId) => {
    await supabase.from("automation_steps").delete().eq("id", stepId);
    setState((s) => ({
      ...s,
      automations: s.automations.map((a) =>
        a.id === automationId ? { ...a, steps: a.steps.filter((st) => st.id !== stepId) } : a
      ),
    }));
  };

  const markNotificationRead: Store["markNotificationRead"] = async (id) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
  };

  const markAllNotificationsRead: Store["markAllNotificationsRead"] = async () => {
    const unreadIds = state.notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  };

  return (
    <StoreContext.Provider
      value={{
        ...state,
        loading,
        addContact,
        getContact,
        updateContact,
        deleteContact,
        updateContactFields,
        addTag,
        removeTag,
        importContacts,
        addOpportunity,
        updateOpportunity,
        deleteOpportunity,
        moveOpportunity,
        addNote,
        activitiesFor,
        addPipeline,
        addStage,
        renameStage,
        deleteStage,
        addTask,
        toggleTask,
        deleteTask,
        addFieldDef,
        removeFieldDef,
        addAppointmentType,
        addAppointment,
        updateAppointment,
        deleteAppointment,
        setAvailability,
        addForm,
        updateForm,
        deleteForm,
        submitForm,
        addMember,
        updateMemberRole,
        removeMember,
        addAutomation,
        updateAutomation,
        deleteAutomation,
        addAutomationStep,
        removeAutomationStep,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
