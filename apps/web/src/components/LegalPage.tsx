// Layout for the public legal pages (privacy policy, data deletion) that the
// Meta app settings link to. Served from this domain because Meta's crawler
// can't fetch the company website (it answers it with HTTP 500).

export type LegalSection = { title: string; paragraphs?: string[]; items?: string[]; after?: string[] };

export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-neutral-800 dark:text-neutral-200">
      <h1 className="text-2xl font-bold mb-1">{title}</h1>
      <p className="text-sm text-neutral-500 mb-8">
        אינווסטד נדל״ן א.ח.ר בע&quot;מ · עודכן לאחרונה: {updated}
      </p>
      {sections.map((s) => (
        <section key={s.title} className="mb-6">
          <h2 className="font-semibold mb-2">{s.title}</h2>
          {s.paragraphs?.map((p) => (
            <p key={p} className="text-sm leading-relaxed mb-2">
              {p}
            </p>
          ))}
          {s.items && (
            <ul className="list-disc ps-5 text-sm leading-relaxed mb-2">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {s.after?.map((p) => (
            <p key={p} className="text-sm leading-relaxed mb-2">
              {p}
            </p>
          ))}
        </section>
      ))}
      <p className="text-sm text-neutral-500 border-t border-neutral-200 dark:border-neutral-800 pt-4">
        יצירת קשר בנושא פרטיות: <a href="mailto:info@investedgroup.co.il" className="underline" dir="ltr">info@investedgroup.co.il</a>
      </p>
    </main>
  );
}
