"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type {
  Contact,
  Pipeline,
  Opportunity,
  Activity,
  Task,
  Stage,
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
import {
  seedContacts,
  seedPipelines,
  seedOpportunities,
  seedActivities,
  seedTasks,
  seedFieldDefs,
  seedAppointmentTypes,
  seedAppointments,
  seedAvailability,
  seedForms,
  seedMembers,
  seedAutomations,
  seedAutomationRuns,
  seedNotifications,
} from "./seed";

// Mock store for the design/skeleton phase. This is the ONLY module to
// replace with real Supabase queries later — every page reads through
// useStore(), never localStorage or seed data directly.

const STORAGE_KEY = "crm-app-v1";

type State = {
  contacts: Contact[];
  pipelines: Pipeline[];
  opportunities: Opportunity[];
  activities: Activity[];
  tasks: Task[];
  fieldDefs: string[]; // known custom-field names, offered as suggestions when adding a field
  appointmentTypes: AppointmentType[];
  appointments: Appointment[];
  availability: AvailabilityRule[];
  forms: LeadForm[];
  members: Member[];
  currentMemberId: string; // "logged in as" for this demo — switchable from the team page
  automations: Automation[];
  automationRuns: AutomationRun[];
  notifications: Notification[];
};

type ContactPatch = Partial<Pick<Contact, "name" | "phone" | "email" | "source">>;
type OpportunityPatch = Partial<Pick<Opportunity, "title" | "value">>;
type ImportRow = { name: string; phone?: string; email?: string; source?: string; fields?: Record<string, string> };

type Store = State & {
  addContact: (c: { name: string; phone?: string; email?: string; source?: string }) => Contact;
  getContact: (id: string) => Contact | undefined;
  updateContact: (contactId: string, patch: ContactPatch) => void;
  deleteContact: (contactId: string) => void;
  updateContactFields: (contactId: string, fields: Record<string, string>) => void;
  addTag: (contactId: string, tag: string) => void;
  removeTag: (contactId: string, tag: string) => void;
  importContacts: (rows: ImportRow[]) => number;

  addOpportunity: (o: { contactId: string; pipelineId: string; stageId: string; title: string; value: number }) => Opportunity;
  updateOpportunity: (opportunityId: string, patch: OpportunityPatch) => void;
  deleteOpportunity: (opportunityId: string) => void;
  moveOpportunity: (opportunityId: string, stageId: string) => void;

  addNote: (contactId: string, text: string) => void;
  activitiesFor: (contactId: string) => Activity[];

  addPipeline: (name: string) => Pipeline;
  addStage: (pipelineId: string, name: string) => void;
  renameStage: (pipelineId: string, stageId: string, name: string) => void;
  deleteStage: (pipelineId: string, stageId: string) => { ok: boolean; reason?: string };

  addTask: (t: { title: string; contactId?: string; assignee?: string; dueDate?: string }) => Task;
  toggleTask: (taskId: string) => void;
  deleteTask: (taskId: string) => void;

  addFieldDef: (name: string) => void;
  removeFieldDef: (name: string) => void;

  addAppointmentType: (name: string, durationMinutes: number) => void;
  addAppointment: (a: { contactId?: string; typeId: string; title: string; startAt: string; endAt: string; notes?: string }) => Appointment;
  updateAppointment: (id: string, patch: Partial<Pick<Appointment, "title" | "startAt" | "endAt" | "notes">>) => void;
  deleteAppointment: (id: string) => void;
  setAvailability: (rules: AvailabilityRule[]) => void;

  addForm: (name: string, fields: FormField[]) => LeadForm;
  updateForm: (id: string, patch: Partial<Pick<LeadForm, "name" | "fields">>) => void;
  deleteForm: (id: string) => void;
  submitForm: (formId: string, values: Record<string, string>) => Contact | null;

  addMember: (name: string, email: string, role: MemberRole) => void;
  updateMemberRole: (id: string, role: MemberRole) => void;
  removeMember: (id: string) => void;
  setCurrentMember: (id: string) => void;

  addAutomation: (a: { name: string; trigger: Automation["trigger"] }) => Automation;
  updateAutomation: (id: string, patch: Partial<Pick<Automation, "name" | "trigger" | "active">>) => void;
  deleteAutomation: (id: string) => void;
  addAutomationStep: (automationId: string, step: Omit<AutomationStep, "id">) => void;
  removeAutomationStep: (automationId: string, stepId: string) => void;

  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
};

const StoreContext = createContext<Store | null>(null);

const seedState: State = {
  contacts: seedContacts,
  pipelines: seedPipelines,
  opportunities: seedOpportunities,
  activities: seedActivities,
  tasks: seedTasks,
  fieldDefs: seedFieldDefs,
  appointmentTypes: seedAppointmentTypes,
  appointments: seedAppointments,
  availability: seedAvailability,
  forms: seedForms,
  members: seedMembers,
  currentMemberId: seedMembers[0]?.id ?? "",
  automations: seedAutomations,
  automationRuns: seedAutomationRuns,
  notifications: seedNotifications,
};

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

// Simulated execution: automations don't send real messages yet (no
// WhatsApp connection), so each step just logs what it WOULD do to the
// contact's timeline. add_tag and notify are the two step types with a
// real, safe effect in the mock store, so those actually run.
function runAutomations(
  s: State,
  type: AutomationTriggerType,
  contactId: string,
  ctx: { pipelineId?: string; stageId?: string; tag?: string }
): { extraTags: string[]; activities: Activity[]; notifications: Notification[]; runs: AutomationRun[] } {
  const matched = s.automations.filter((a) => {
    if (!a.active || a.trigger.type !== type) return false;
    if (a.trigger.pipelineId && a.trigger.pipelineId !== ctx.pipelineId) return false;
    if (a.trigger.stageId && a.trigger.stageId !== ctx.stageId) return false;
    if (a.trigger.tag && a.trigger.tag !== ctx.tag) return false;
    return true;
  });

  const extraTags: string[] = [];
  const activities: Activity[] = [];
  const notifications: Notification[] = [];
  const runs: AutomationRun[] = [];

  matched.forEach((automation, ai) => {
    const stepsLog: string[] = [];
    automation.steps.forEach((step) => {
      stepsLog.push(describeAutomationStep(step));
      if (step.type === "add_tag" && step.tag) extraTags.push(step.tag);
      if (step.type === "notify") {
        notifications.push({
          id: `n-${Date.now()}-${ai}-${notifications.length}`,
          text: step.notifyText || `אוטומציה "${automation.name}" רצה`,
          contactId,
          createdAt: new Date().toISOString(),
          read: false,
        });
      }
    });
    activities.push({
      id: `a-auto-${Date.now()}-${ai}`,
      contactId,
      type: "note",
      text: `🤖 אוטומציה "${automation.name}" הופעלה: ${stepsLog.join(" ← ")}`,
      createdAt: new Date().toISOString(),
    });
    runs.push({
      id: `run-${Date.now()}-${ai}`,
      automationId: automation.id,
      contactId,
      ranAt: new Date().toISOString(),
      stepsLog,
    });
  });

  return { extraTags, activities, notifications, runs };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // Always start from seed data on both server and the client's first
  // render — reading localStorage here would make the client's first
  // render diverge from what the server sent, which is a hydration
  // mismatch. The real (persisted) state loads right after mount instead,
  // in the effect below, which only ever runs on the client.
  const [state, setState] = useState<State>(seedState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState((s) => ({ ...s, ...(JSON.parse(raw) as Partial<State>) }));
    } catch {
      // corrupted storage — keep seed data
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return; // don't overwrite storage with seed data before the load above runs
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full/unavailable — state still works in-memory this session
    }
  }, [state, hydrated]);

  const addContact: Store["addContact"] = (c) => {
    const id = `c-${Date.now()}`;
    const createdAt = new Date().toISOString();
    setState((s) => {
      const { extraTags, activities, notifications, runs } = runAutomations(s, "new_contact", id, {});
      const contact: Contact = { ...c, id, tags: extraTags, fields: {}, createdAt };
      return {
        ...s,
        contacts: [...s.contacts, contact],
        activities: [...s.activities, ...activities],
        notifications: [...s.notifications, ...notifications],
        automationRuns: [...s.automationRuns, ...runs],
      };
    });
    return { ...c, id, tags: [], fields: {}, createdAt };
  };

  const getContact: Store["getContact"] = (id) => state.contacts.find((c) => c.id === id);

  const updateContact: Store["updateContact"] = (contactId, patch) => {
    setState((s) => ({ ...s, contacts: s.contacts.map((c) => (c.id === contactId ? { ...c, ...patch } : c)) }));
  };

  const deleteContact: Store["deleteContact"] = (contactId) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.filter((c) => c.id !== contactId),
      opportunities: s.opportunities.filter((o) => o.contactId !== contactId),
      activities: s.activities.filter((a) => a.contactId !== contactId),
      tasks: s.tasks.map((t) => (t.contactId === contactId ? { ...t, contactId: undefined } : t)),
    }));
  };

  const updateContactFields: Store["updateContactFields"] = (contactId, fields) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) => (c.id === contactId ? { ...c, fields: { ...c.fields, ...fields } } : c)),
      fieldDefs: Array.from(new Set([...s.fieldDefs, ...Object.keys(fields)])),
    }));
  };

  const addTag: Store["addTag"] = (contactId, tag) => {
    setState((s) => {
      const contact = s.contacts.find((c) => c.id === contactId);
      if (!contact || contact.tags.includes(tag)) return s;
      const { extraTags, activities, notifications, runs } = runAutomations(s, "tag_added", contactId, { tag });
      const newTags = Array.from(new Set([tag, ...extraTags]));
      return {
        ...s,
        contacts: s.contacts.map((c) =>
          c.id === contactId ? { ...c, tags: Array.from(new Set([...c.tags, ...newTags])) } : c
        ),
        activities: [...s.activities, ...activities],
        notifications: [...s.notifications, ...notifications],
        automationRuns: [...s.automationRuns, ...runs],
      };
    });
  };

  const removeTag: Store["removeTag"] = (contactId, tag) => {
    setState((s) => ({
      ...s,
      contacts: s.contacts.map((c) => (c.id === contactId ? { ...c, tags: c.tags.filter((t) => t !== tag) } : c)),
    }));
  };

  const importContacts: Store["importContacts"] = (rows) => {
    const now = Date.now();
    const newContacts: Contact[] = rows.map((r, i) => ({
      id: `c-${now}-${i}`,
      name: r.name,
      phone: r.phone,
      email: r.email,
      source: r.source ?? "ייבוא CSV",
      tags: [],
      fields: r.fields ?? {},
      createdAt: new Date().toISOString(),
    }));
    const newFieldNames = newContacts.flatMap((c) => Object.keys(c.fields));
    setState((s) => ({
      ...s,
      contacts: [...s.contacts, ...newContacts],
      fieldDefs: Array.from(new Set([...s.fieldDefs, ...newFieldNames])),
    }));
    return newContacts.length;
  };

  const addOpportunity: Store["addOpportunity"] = (o) => {
    const opp: Opportunity = { ...o, id: `o-${Date.now()}`, createdAt: new Date().toISOString() };
    setState((s) => ({ ...s, opportunities: [...s.opportunities, opp] }));
    return opp;
  };

  const updateOpportunity: Store["updateOpportunity"] = (opportunityId, patch) => {
    setState((s) => ({
      ...s,
      opportunities: s.opportunities.map((o) => (o.id === opportunityId ? { ...o, ...patch } : o)),
    }));
  };

  const deleteOpportunity: Store["deleteOpportunity"] = (opportunityId) => {
    setState((s) => ({ ...s, opportunities: s.opportunities.filter((o) => o.id !== opportunityId) }));
  };

  const moveOpportunity: Store["moveOpportunity"] = (opportunityId, stageId) => {
    setState((s) => {
      const opp = s.opportunities.find((o) => o.id === opportunityId);
      if (!opp || opp.stageId === stageId) return s;
      const pipeline = s.pipelines.find((p) => p.id === opp.pipelineId);
      const stageName = pipeline?.stages.find((st) => st.id === stageId)?.name ?? stageId;
      const activity: Activity = {
        id: `a-${Date.now()}`,
        contactId: opp.contactId,
        type: "stage_change",
        text: `הועבר לשלב "${stageName}"`,
        createdAt: new Date().toISOString(),
      };
      const { extraTags, activities, notifications, runs } = runAutomations(s, "stage_change", opp.contactId, {
        pipelineId: opp.pipelineId,
        stageId,
      });
      return {
        ...s,
        opportunities: s.opportunities.map((o) => (o.id === opportunityId ? { ...o, stageId } : o)),
        contacts: extraTags.length
          ? s.contacts.map((c) =>
              c.id === opp.contactId ? { ...c, tags: Array.from(new Set([...c.tags, ...extraTags])) } : c
            )
          : s.contacts,
        activities: [...s.activities, activity, ...activities],
        notifications: [...s.notifications, ...notifications],
        automationRuns: [...s.automationRuns, ...runs],
      };
    });
  };

  const addNote: Store["addNote"] = (contactId, text) => {
    const activity: Activity = { id: `a-${Date.now()}`, contactId, type: "note", text, createdAt: new Date().toISOString() };
    setState((s) => ({ ...s, activities: [...s.activities, activity] }));
  };

  const activitiesFor: Store["activitiesFor"] = (contactId) =>
    state.activities
      .filter((a) => a.contactId === contactId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const addPipeline: Store["addPipeline"] = (name) => {
    const pipeline: Pipeline = {
      id: `pl-${Date.now()}`,
      name,
      stages: [{ id: `st-${Date.now()}`, name: "חדש", winProbability: 10 }],
    };
    setState((s) => ({ ...s, pipelines: [...s.pipelines, pipeline] }));
    return pipeline;
  };

  const addStage: Store["addStage"] = (pipelineId, name) => {
    const stage: Stage = { id: `st-${Date.now()}`, name, winProbability: 10 };
    setState((s) => ({
      ...s,
      pipelines: s.pipelines.map((p) => (p.id === pipelineId ? { ...p, stages: [...p.stages, stage] } : p)),
    }));
  };

  const renameStage: Store["renameStage"] = (pipelineId, stageId, name) => {
    setState((s) => ({
      ...s,
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId
          ? { ...p, stages: p.stages.map((st) => (st.id === stageId ? { ...st, name } : st)) }
          : p
      ),
    }));
  };

  const deleteStage: Store["deleteStage"] = (pipelineId, stageId) => {
    const hasOpportunities = state.opportunities.some((o) => o.pipelineId === pipelineId && o.stageId === stageId);
    if (hasOpportunities) return { ok: false, reason: "יש הזדמנויות פתוחות בשלב הזה — צריך להעביר אותן קודם." };
    setState((s) => ({
      ...s,
      pipelines: s.pipelines.map((p) =>
        p.id === pipelineId ? { ...p, stages: p.stages.filter((st) => st.id !== stageId) } : p
      ),
    }));
    return { ok: true };
  };

  const addTask: Store["addTask"] = (t) => {
    const task: Task = { ...t, id: `t-${Date.now()}`, done: false, createdAt: new Date().toISOString() };
    setState((s) => ({ ...s, tasks: [...s.tasks, task] }));
    return task;
  };

  const toggleTask: Store["toggleTask"] = (taskId) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) }));
  };

  const deleteTask: Store["deleteTask"] = (taskId) => {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) }));
  };

  const addFieldDef: Store["addFieldDef"] = (name) => {
    setState((s) => (s.fieldDefs.includes(name) ? s : { ...s, fieldDefs: [...s.fieldDefs, name] }));
  };

  const removeFieldDef: Store["removeFieldDef"] = (name) => {
    setState((s) => ({ ...s, fieldDefs: s.fieldDefs.filter((f) => f !== name) }));
  };

  const addAppointmentType: Store["addAppointmentType"] = (name, durationMinutes) => {
    const type: AppointmentType = { id: `at-${Date.now()}`, name, durationMinutes };
    setState((s) => ({ ...s, appointmentTypes: [...s.appointmentTypes, type] }));
  };

  const addAppointment: Store["addAppointment"] = (a) => {
    const appointment: Appointment = { ...a, id: `ap-${Date.now()}`, createdAt: new Date().toISOString() };
    setState((s) => ({ ...s, appointments: [...s.appointments, appointment] }));
    return appointment;
  };

  const updateAppointment: Store["updateAppointment"] = (id, patch) => {
    setState((s) => ({
      ...s,
      appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  };

  const deleteAppointment: Store["deleteAppointment"] = (id) => {
    setState((s) => ({ ...s, appointments: s.appointments.filter((a) => a.id !== id) }));
  };

  const setAvailability: Store["setAvailability"] = (rules) => {
    setState((s) => ({ ...s, availability: rules }));
  };

  const addForm: Store["addForm"] = (name, fields) => {
    const form: LeadForm = { id: `form-${Date.now()}`, name, fields, createdAt: new Date().toISOString() };
    setState((s) => ({ ...s, forms: [...s.forms, form] }));
    return form;
  };

  const updateForm: Store["updateForm"] = (id, patch) => {
    setState((s) => ({ ...s, forms: s.forms.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  };

  const deleteForm: Store["deleteForm"] = (id) => {
    setState((s) => ({ ...s, forms: s.forms.filter((f) => f.id !== id) }));
  };

  const submitForm: Store["submitForm"] = (formId, values) => {
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
    const contact = addContact({
      name,
      phone: phoneField ? values[phoneField.key]?.trim() || undefined : undefined,
      email: emailField ? values[emailField.key]?.trim() || undefined : undefined,
      source: form.name,
    });
    if (Object.keys(extraFields).length) updateContactFields(contact.id, extraFields);
    return contact;
  };

  const addMember: Store["addMember"] = (name, email, role) => {
    const member: Member = { id: `m-${Date.now()}`, name, email, role, status: "invited", createdAt: new Date().toISOString() };
    setState((s) => ({ ...s, members: [...s.members, member] }));
  };

  const updateMemberRole: Store["updateMemberRole"] = (id, role) => {
    setState((s) => ({ ...s, members: s.members.map((m) => (m.id === id ? { ...m, role } : m)) }));
  };

  const removeMember: Store["removeMember"] = (id) => {
    setState((s) => {
      if (id === s.currentMemberId) return s; // can't remove the member you're viewing as
      return { ...s, members: s.members.filter((m) => m.id !== id) };
    });
  };

  const setCurrentMember: Store["setCurrentMember"] = (id) => {
    setState((s) => ({ ...s, currentMemberId: id }));
  };

  const addAutomation: Store["addAutomation"] = (a) => {
    const automation: Automation = { id: `auto-${Date.now()}`, name: a.name, active: true, trigger: a.trigger, steps: [], createdAt: new Date().toISOString() };
    setState((s) => ({ ...s, automations: [...s.automations, automation] }));
    return automation;
  };

  const updateAutomation: Store["updateAutomation"] = (id, patch) => {
    setState((s) => ({ ...s, automations: s.automations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  };

  const deleteAutomation: Store["deleteAutomation"] = (id) => {
    setState((s) => ({ ...s, automations: s.automations.filter((a) => a.id !== id) }));
  };

  const addAutomationStep: Store["addAutomationStep"] = (automationId, step) => {
    const newStep: AutomationStep = { ...step, id: `step-${Date.now()}` };
    setState((s) => ({
      ...s,
      automations: s.automations.map((a) =>
        a.id === automationId ? { ...a, steps: [...a.steps, newStep] } : a
      ),
    }));
  };

  const removeAutomationStep: Store["removeAutomationStep"] = (automationId, stepId) => {
    setState((s) => ({
      ...s,
      automations: s.automations.map((a) =>
        a.id === automationId ? { ...a, steps: a.steps.filter((st) => st.id !== stepId) } : a
      ),
    }));
  };

  const markNotificationRead: Store["markNotificationRead"] = (id) => {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  };

  const markAllNotificationsRead: Store["markAllNotificationsRead"] = () => {
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  };

  return (
    <StoreContext.Provider
      value={{
        ...state,
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
        setCurrentMember,
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
