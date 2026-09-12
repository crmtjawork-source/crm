"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default function CalendarPage() {
  const {
    appointments,
    appointmentTypes,
    availability,
    contacts,
    addAppointment,
    deleteAppointment,
    addAppointmentType,
    setAvailability,
  } = useStore();

  const [view, setView] = useState<"month" | "list">("month");
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [showForm, setShowForm] = useState(false);
  const [contactId, setContactId] = useState("");
  const [typeId, setTypeId] = useState(appointmentTypes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");

  const [showTypeForm, setShowTypeForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDuration, setNewTypeDuration] = useState("30");

  const sorted = [...appointments].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const now = new Date().toISOString();
  const upcoming = sorted.filter((a) => a.endAt >= now);
  const past = sorted.filter((a) => a.endAt < now);

  function openFormForDate(date: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    setStart(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00`);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!typeId || !start) return;
    const type = appointmentTypes.find((t) => t.id === typeId);
    const startDate = new Date(start);
    const endDate = new Date(startDate.getTime() + (type?.durationMinutes ?? 30) * 60000);
    const contactName = contacts.find((c) => c.id === contactId)?.name ?? "";
    addAppointment({
      contactId: contactId || undefined,
      typeId,
      title: title.trim() || (contactName ? `${type?.name ?? "פגישה"} — ${contactName}` : type?.name ?? "פגישה"),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
    });
    setContactId("");
    setTitle("");
    setStart("");
    setShowForm(false);
  }

  function handleAddType(e: React.FormEvent) {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    addAppointmentType(newTypeName.trim(), Number(newTypeDuration) || 30);
    setNewTypeName("");
    setNewTypeDuration("30");
    setShowTypeForm(false);
  }

  function toggleDay(day: number) {
    const exists = availability.find((r) => r.day === day);
    if (exists) {
      setAvailability(availability.filter((r) => r.day !== day));
    } else {
      setAvailability([...availability, { day, startTime: "09:00", endTime: "17:00" }].sort((a, b) => a.day - b.day));
    }
  }

  function updateDayTime(day: number, field: "startTime" | "endTime", value: string) {
    setAvailability(availability.map((r) => (r.day === day ? { ...r, [field]: value } : r)));
  }

  return (
    <div className={`p-6 ${view === "month" ? "max-w-4xl" : "max-w-3xl"}`}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-xl font-bold">יומן</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden text-sm">
            <button
              onClick={() => setView("month")}
              className={`px-3 py-1.5 ${view === "month" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
            >
              לוח חודשי
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 ${view === "list" ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : ""}`}
            >
              רשימה
            </button>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          >
            + פגישה חדשה
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="flex flex-wrap gap-2">
            <label className="text-sm">
              <span className="block text-xs text-neutral-500 mb-1">ליד (אופציונלי)</span>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              >
                <option value="">ללא</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-neutral-500 mb-1">סוג פגישה</span>
              <select
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                required
                className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              >
                {appointmentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.durationMinutes} דק')
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-xs text-neutral-500 mb-1">מתי</span>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
                className="px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="block text-xs text-neutral-500 mb-1">כותרת (אופציונלי)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
          </label>
          <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
            קביעת פגישה
          </button>
        </form>
      )}

      {view === "month" ? (
        <MonthCalendar
          monthCursor={monthCursor}
          setMonthCursor={setMonthCursor}
          appointments={appointments}
          availability={availability}
          onSelectDay={openFormForDate}
        />
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-neutral-500 mb-3">פגישות קרובות</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-neutral-400">אין פגישות קרובות.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((a) => (
                  <AppointmentRow key={a.id} appointment={a} onDelete={() => deleteAppointment(a.id)} />
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold text-neutral-500 mb-3">פגישות שעברו</h2>
              <ul className="space-y-2 opacity-60">
                {past.map((a) => (
                  <AppointmentRow key={a.id} appointment={a} onDelete={() => deleteAppointment(a.id)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-500">סוגי פגישות</h2>
          <button
            onClick={() => setShowTypeForm((v) => !v)}
            className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline"
          >
            + סוג חדש
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {appointmentTypes.map((t) => (
            <span key={t.id} className="text-xs px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">
              {t.name} · {t.durationMinutes} דק'
            </span>
          ))}
        </div>
        {showTypeForm && (
          <form onSubmit={handleAddType} className="flex gap-2">
            <input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="שם הסוג"
              className="flex-1 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
            <input
              value={newTypeDuration}
              onChange={(e) => setNewTypeDuration(e.target.value)}
              type="number"
              placeholder="משך (דק')"
              className="w-28 px-2 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
            />
            <button type="submit" className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
              הוספה
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-500 mb-3">זמינות שבועית</h2>
        <div className="space-y-2">
          {DAY_NAMES.map((name, day) => {
            const rule = availability.find((r) => r.day === day);
            return (
              <div key={day} className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2 w-24">
                  <input type="checkbox" checked={!!rule} onChange={() => toggleDay(day)} />
                  {name}
                </label>
                {rule && (
                  <>
                    <input
                      type="time"
                      value={rule.startTime}
                      onChange={(e) => updateDayTime(day, "startTime", e.target.value)}
                      className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
                    />
                    <span className="text-neutral-400">עד</span>
                    <input
                      type="time"
                      value={rule.endTime}
                      onChange={(e) => updateDayTime(day, "endTime", e.target.value)}
                      className="px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function MonthCalendar({
  monthCursor,
  setMonthCursor,
  appointments,
  availability,
  onSelectDay,
}: {
  monthCursor: Date;
  setMonthCursor: (d: Date) => void;
  appointments: { id: string; title: string; startAt: string; endAt: string; contactId?: string }[];
  availability: { day: number }[];
  onSelectDay: (date: Date) => void;
}) {
  const { deleteAppointment } = useStore();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const today = new Date();

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  function changeMonth(delta: number) {
    setMonthCursor(new Date(year, month + delta, 1));
    setSelectedDate(null);
  }

  const selectedDayAppointments = selectedDate
    ? appointments
        .filter((a) => sameDay(new Date(a.startAt), selectedDate))
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
    : [];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeMonth(-1)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-800"
          >
            ‹
          </button>
          <h2 className="text-sm font-semibold w-32 text-center">
            {monthCursor.toLocaleDateString("he-IL", { month: "long", year: "numeric" })}
          </h2>
          <button
            onClick={() => changeMonth(1)}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-800"
          >
            ›
          </button>
        </div>
        <button
          onClick={() => {
            const t = new Date();
            t.setDate(1);
            t.setHours(0, 0, 0, 0);
            setMonthCursor(t);
          }}
          className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:underline"
        >
          היום
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-3">
        {DAY_NAMES.map((name) => (
          <div key={name} className="text-xs text-neutral-500 text-center py-1">
            {name}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="aspect-square" />;
          const dayAppointments = appointments.filter((a) => sameDay(new Date(a.startAt), date));
          const isToday = sameDay(date, today);
          const isSelected = selectedDate && sameDay(date, selectedDate);
          const isAvailable = availability.some((r) => r.day === date.getDay());
          const shown = dayAppointments.slice(0, 2);
          const extra = dayAppointments.length - shown.length;
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(date)}
              className={`aspect-square min-h-16 rounded-md border p-1 text-start flex flex-col overflow-hidden ${
                isSelected
                  ? "border-neutral-900 dark:border-white"
                  : "border-neutral-200 dark:border-neutral-800"
              } ${isAvailable ? "bg-transparent" : "bg-neutral-50 dark:bg-neutral-900/50"}`}
            >
              <span
                className={`text-xs mb-1 ${
                  isToday
                    ? "w-5 h-5 flex items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-500"
                }`}
              >
                {date.getDate()}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                {shown.map((a) => (
                  <span
                    key={a.id}
                    className="text-[10px] leading-tight px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 truncate"
                  >
                    {new Date(a.startAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })} {a.title}
                  </span>
                ))}
                {extra > 0 && <span className="text-[10px] text-neutral-400">+{extra} נוספות</span>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">
              {selectedDate.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            <button
              onClick={() => onSelectDay(selectedDate)}
              className="text-xs px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800"
            >
              + פגישה ביום זה
            </button>
          </div>
          {selectedDayAppointments.length === 0 ? (
            <p className="text-sm text-neutral-400">אין פגישות ביום זה.</p>
          ) : (
            <ul className="space-y-2">
              {selectedDayAppointments.map((a) => (
                <AppointmentRow key={a.id} appointment={a} onDelete={() => deleteAppointment(a.id)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AppointmentRow({
  appointment,
  onDelete,
}: {
  appointment: { id: string; title: string; startAt: string; endAt: string; contactId?: string };
  onDelete: () => void;
}) {
  const { contacts } = useStore();
  const contact = contacts.find((c) => c.id === appointment.contactId);
  const start = new Date(appointment.startAt);
  const end = new Date(appointment.endAt);
  return (
    <li className="flex items-center justify-between border border-neutral-200 dark:border-neutral-800 rounded-md px-4 py-2.5 text-sm">
      <div>
        <p className="font-medium">{appointment.title}</p>
        <p className="text-xs text-neutral-500">
          {start.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" })} ·{" "}
          {start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}–
          {end.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
          {contact && (
            <>
              {" · "}
              <Link href={`/contacts/${contact.id}`} className="hover:underline">
                {contact.name}
              </Link>
            </>
          )}
        </p>
      </div>
      <button onClick={onDelete} className="text-neutral-400 hover:text-red-500 text-xs">
        ביטול
      </button>
    </li>
  );
}
