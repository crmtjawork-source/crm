"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function NewContactPage() {
  const router = useRouter();
  const { addContact } = useStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const contact = addContact({
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      source: source.trim() || undefined,
    });
    router.push(`/contacts/${contact.id}`);
  }

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-xl font-bold mb-6">ליד חדש</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="שם" value={name} onChange={setName} required autoFocus />
        <Field label="טלפון" value={phone} onChange={setPhone} dir="ltr" />
        <Field label="אימייל" value={email} onChange={setEmail} dir="ltr" />
        <Field label="מקור" value={source} onChange={setSource} placeholder="פייסבוק, אתר, הפניה…" />
        <button
          type="submit"
          className="px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium"
        >
          שמירה
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  dir,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  dir?: "ltr" | "rtl";
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-neutral-500 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        dir={dir}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent"
      />
    </label>
  );
}
