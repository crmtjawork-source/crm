"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    getContact,
    opportunities,
    activitiesFor,
    updateContact,
    deleteContact,
    updateContactFields,
    addTag,
    removeTag,
    addNote,
    fieldDefs,
    members,
    currentMemberId,
  } = useStore();
  const contact = getContact(id);
  const canDelete = members.find((m) => m.id === currentMemberId)?.role !== "agent";

  const [editingInfo, setEditingInfo] = useState(false);
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [source, setSource] = useState(contact?.source ?? "");

  const [newTag, setNewTag] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [noteText, setNoteText] = useState("");

  if (!contact) {
    return <div className="p-6 text-neutral-500">הליד לא נמצא.</div>;
  }

  const contactOpportunities = opportunities.filter((o) => o.contactId === contact.id);
  const activities = activitiesFor(contact.id);

  function startEdit() {
    if (!contact) return;
    setName(contact.name);
    setPhone(contact.phone ?? "");
    setEmail(contact.email ?? "");
    setSource(contact.source ?? "");
    setEditingInfo(true);
  }

  function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!contact || !name.trim()) return;
    updateContact(contact.id, {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      source: source.trim() || undefined,
    });
    setEditingInfo(false);
  }

  function handleDeleteContact() {
    if (!contact) return;
    if (!confirm(`למחוק את ${contact.name}? הפעולה מוחקת גם את ההזדמנויות והפעילות שלו.`)) return;
    deleteContact(contact.id);
    router.push("/contacts");
  }

  function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTag.trim() || !contact) return;
    addTag(contact.id, newTag.trim());
    setNewTag("");
  }

  function handleAddField(e: React.FormEvent) {
    e.preventDefault();
    if (!fieldKey.trim() || !contact) return;
    updateContactFields(contact.id, { [fieldKey.trim()]: fieldValue.trim() });
    setFieldKey("");
    setFieldValue("");
  }

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim() || !contact) return;
    addNote(contact.id, noteText.trim());
    setNoteText("");
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-start justify-between mb-1">
        {editingInfo ? (
          <form onSubmit={saveInfo} className="w-full space-y-2 mb-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent font-bold"
              placeholder="שם"
            />
            <div className="flex gap-2">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                placeholder="טלפון"
                className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                placeholder="אימייל"
                className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="מקור"
                className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-3 py-1.5 text-sm rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                שמירה
              </button>
              <button type="button" onClick={() => setEditingInfo(false)} className="px-3 py-1.5 text-sm text-neutral-400">
                ביטול
              </button>
            </div>
          </form>
        ) : (
          <div className="mb-4">
            <h1 className="text-xl font-bold mb-1">{contact.name}</h1>
            <p className="text-sm text-neutral-500">
              <span dir="ltr">{contact.phone ?? "אין טלפון"}</span> · {contact.email ?? "אין אימייל"}
              {contact.source && <> · {contact.source}</>}
            </p>
          </div>
        )}
      </div>

      {!editingInfo && (
        <div className="flex gap-3 mb-4 text-xs">
          <button onClick={startEdit} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline">
            עריכת פרטים
          </button>
          {canDelete ? (
            <button onClick={handleDeleteContact} className="text-neutral-400 hover:text-red-500 hover:underline">
              מחיקת ליד
            </button>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-700" title="רק מנהלים ובעלים יכולים למחוק לידים">
              מחיקת ליד
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {contact.tags.map((t) => (
          <span
            key={t}
            className="text-xs px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center gap-1"
          >
            {t}
            <button onClick={() => removeTag(contact.id, t)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
              ×
            </button>
          </span>
        ))}
        <form onSubmit={handleAddTag} className="inline-flex">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="+ תגית"
            className="w-20 px-2 py-1 text-xs rounded-full border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
        </form>
      </div>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-neutral-500 mb-2">שדות מותאמים אישית</h2>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {Object.entries(contact.fields).map(([key, value]) => (
            <div key={key} className="border border-neutral-200 dark:border-neutral-800 rounded-md p-3">
              <dt className="text-xs text-neutral-500">{key}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </div>
        <form onSubmit={handleAddField} className="flex gap-2">
          <input
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value)}
            placeholder="שם שדה (למשל: תקציב)"
            list="field-defs"
            className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
          <datalist id="field-defs">
            {fieldDefs.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          <input
            value={fieldValue}
            onChange={(e) => setFieldValue(e.target.value)}
            placeholder="ערך"
            className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-neutral-500 mb-2">הזדמנויות</h2>
        {contactOpportunities.length === 0 ? (
          <p className="text-sm text-neutral-400">אין הזדמנויות פתוחות.</p>
        ) : (
          <ul className="space-y-2">
            {contactOpportunities.map((o) => (
              <li key={o.id} className="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 text-sm">
                {o.title} {o.value > 0 ? `· ₪${o.value.toLocaleString("he-IL")}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-500 mb-2">ציר זמן</h2>
        <form onSubmit={handleAddNote} className="flex gap-2 mb-4">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="הוספת הערה…"
            className="flex-1 px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
          />
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            הוספה
          </button>
        </form>
        {activities.length === 0 ? (
          <p className="text-sm text-neutral-400">אין עדיין פעילות.</p>
        ) : (
          <ul className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="text-sm flex gap-2">
                <span className={a.type === "note" ? "text-neutral-400" : "text-neutral-300"}>
                  {a.type === "note" ? "📝" : "→"}
                </span>
                <div>
                  <p>{a.text}</p>
                  <p className="text-xs text-neutral-400">
                    {new Date(a.createdAt).toLocaleString("he-IL")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
