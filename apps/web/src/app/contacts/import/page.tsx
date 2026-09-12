"use client";

import { useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { useStore } from "@/lib/store";

const NAME_ALIASES = ["name", "שם", "שם מלא", "full name"];
const PHONE_ALIASES = ["phone", "טלפון", "נייד", "מספר טלפון"];
const EMAIL_ALIASES = ["email", "אימייל", "מייל", "e-mail"];
const SOURCE_ALIASES = ["source", "מקור"];

function findColumn(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

type ParsedRow = Record<string, string>;

export default function ImportContactsPage() {
  const { importContacts } = useStore();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImportedCount(null);
    setFileName(file.name);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0) {
          setError(result.errors[0].message);
          return;
        }
        const cols = result.meta.fields ?? [];
        if (!findColumn(cols, NAME_ALIASES)) {
          setError('לא נמצאה עמודת "שם" — ודאו שיש עמודה בשם name או שם בקובץ.');
          setRows([]);
          setHeaders([]);
          return;
        }
        setHeaders(cols);
        setRows(result.data);
      },
    });
  }

  function handleImport() {
    const nameCol = findColumn(headers, NAME_ALIASES)!;
    const phoneCol = findColumn(headers, PHONE_ALIASES);
    const emailCol = findColumn(headers, EMAIL_ALIASES);
    const sourceCol = findColumn(headers, SOURCE_ALIASES);
    const knownCols = new Set([nameCol, phoneCol, emailCol, sourceCol].filter(Boolean));
    const extraCols = headers.filter((h) => !knownCols.has(h));

    const imported = rows
      .filter((r) => r[nameCol]?.trim())
      .map((r) => {
        const fields: Record<string, string> = {};
        for (const col of extraCols) {
          if (r[col]?.trim()) fields[col] = r[col].trim();
        }
        return {
          name: r[nameCol].trim(),
          phone: phoneCol ? r[phoneCol]?.trim() || undefined : undefined,
          email: emailCol ? r[emailCol]?.trim() || undefined : undefined,
          source: sourceCol ? r[sourceCol]?.trim() || undefined : undefined,
          fields,
        };
      });

    const count = importContacts(imported);
    setImportedCount(count);
    setRows([]);
    setHeaders([]);
  }

  const nameCol = headers.length ? findColumn(headers, NAME_ALIASES) : null;
  const phoneCol = headers.length ? findColumn(headers, PHONE_ALIASES) : null;
  const emailCol = headers.length ? findColumn(headers, EMAIL_ALIASES) : null;
  const sourceCol = headers.length ? findColumn(headers, SOURCE_ALIASES) : null;
  const extraCols = headers.filter((h) => ![nameCol, phoneCol, emailCol, sourceCol].includes(h));

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold mb-1">ייבוא לידים מ-CSV</h1>
      <p className="text-sm text-neutral-500 mb-6">
        קובץ עם שורת כותרות. עמודת שם היא חובה (name / שם). טלפון, אימייל ומקור מזוהים אוטומטית אם קיימים. כל עמודה אחרת הופכת לשדה מותאם אישית.
      </p>

      {importedCount !== null && (
        <div className="mb-4 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 p-3">
          יובאו {importedCount} לידים בהצלחה. <Link href="/contacts" className="underline">לצפייה ברשימה</Link>.
        </div>
      )}

      <input
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="text-sm mb-4"
      />

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {rows.length > 0 && (
        <>
          <div className="mb-4 text-sm">
            <p className="mb-2">
              <b>{fileName}</b> · {rows.length} שורות זוהו
            </p>
            <ul className="text-xs text-neutral-500 space-y-1">
              <li>שם ← {nameCol}</li>
              {phoneCol && <li>טלפון ← {phoneCol}</li>}
              {emailCol && <li>אימייל ← {emailCol}</li>}
              {sourceCol && <li>מקור ← {sourceCol}</li>}
              {extraCols.length > 0 && <li>שדות מותאמים: {extraCols.join(", ")}</li>}
            </ul>
          </div>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto mb-4">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-neutral-500">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="text-start px-3 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-neutral-200 dark:border-neutral-800">
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-2 whitespace-nowrap">
                        {r[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 5 && (
              <p className="text-xs text-neutral-400 px-3 py-2">ועוד {rows.length - 5} שורות…</p>
            )}
          </div>

          <button
            onClick={handleImport}
            className="px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium"
          >
            ייבוא {rows.length} לידים
          </button>
        </>
      )}
    </div>
  );
}
