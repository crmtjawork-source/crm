import { Fragment } from "react";
import { inlineParts, parseBody, SIGNER_FIELDS } from "@/lib/documents";
import type { DocSection } from "@/lib/types";

// The document as the lead reads it — used by the public link and by the
// in-app preview, so what an agent sees is exactly what the lead gets.

export type CoverData = {
  title?: string;
  prepared_for?: string;
  date?: string;
  logo_url?: string;
  cover_image_url?: string;
  accent_color?: string;
  sender_name?: string;
  sender_email?: string;
};

export type SignatureData = { name: string; image?: string; fields?: Record<string, string>; signedAt?: string; contentHash?: string };

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-neutral-900">
            {p.text}
          </strong>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        )
      )}
    </>
  );
}

export function SectionBody({ body }: { body: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-7 text-neutral-700">
      {parseBody(body).map((b, i) => {
        if (b.type === "h") return <h3 key={i} className="text-base font-semibold text-neutral-900 pt-2"><Inline text={b.text} /></h3>;
        if (b.type === "p")
          return (
            <p key={i}>
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Inline text={l} />
                </Fragment>
              ))}
            </p>
          );
        const List = b.type === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={`${b.type === "ul" ? "list-disc" : "list-decimal"} ps-5 space-y-1.5 marker:text-[var(--accent)]`}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Inline text={it} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

export function DocumentView({
  cover,
  sections,
  signature,
  sectionRef,
}: {
  cover: CoverData;
  sections: DocSection[];
  signature?: SignatureData | null;
  sectionRef?: (id: string, el: HTMLElement | null) => void;
}) {
  const accent = cover.accent_color || "#1e3a8a";
  return (
    <article style={{ ["--accent" as string]: accent }} className="bg-white text-neutral-900 shadow-sm print:shadow-none">
      <header
        className="relative overflow-hidden px-6 sm:px-12 py-12 sm:py-16 text-white"
        style={{
          backgroundColor: accent,
          backgroundImage: cover.cover_image_url ? `linear-gradient(${accent}d9, ${accent}d9), url(${cover.cover_image_url})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="flex flex-col-reverse sm:flex-row sm:items-start gap-8 justify-between">
          <div>
            <h1 className="text-2xl sm:text-4xl font-semibold leading-tight">{cover.title}</h1>
            <div className="w-10 h-px bg-white/60 my-5" />
            {cover.prepared_for && (
              <>
                <p className="text-sm text-white/70">הוכן עבור</p>
                <p className="text-xl sm:text-2xl">{cover.prepared_for}</p>
              </>
            )}
            {cover.date && <p className="text-lg text-white/80 mt-2">{cover.date}</p>}
            {(cover.sender_name || cover.sender_email) && (
              <p className="text-sm text-white/70 mt-6">
                {cover.sender_name}
                {cover.sender_email && <span className="block" dir="ltr">{cover.sender_email}</span>}
              </p>
            )}
          </div>
          {cover.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.logo_url} alt="" className="w-28 sm:w-40 bg-white rounded-md p-3 object-contain shrink-0" />
          )}
        </div>
      </header>

      <div className="px-6 sm:px-12 py-8 divide-y divide-neutral-100">
        {sections.map((s) => (
          <section key={s.id} id={`s-${s.id}`} data-section={s.id} ref={(el) => sectionRef?.(s.id, el)} className="py-8 sm:grid sm:grid-cols-[200px_1fr] sm:gap-10 scroll-mt-4 break-inside-avoid-page">
            <div className="mb-3 sm:mb-0">
              <h2 className="text-xl sm:text-2xl font-semibold" style={{ color: accent }}>
                {s.title}
              </h2>
              {s.subtitle && <p className="text-sm text-neutral-500 mt-1">{s.subtitle}</p>}
            </div>
            <SectionBody body={s.body} />
          </section>
        ))}

        {signature && (
          <section className="py-8 sm:grid sm:grid-cols-[200px_1fr] sm:gap-10 break-inside-avoid-page">
            <h2 className="text-xl sm:text-2xl font-semibold mb-3" style={{ color: accent }}>
              חתימה
            </h2>
            <div className="text-sm text-neutral-700 space-y-1">
              {signature.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signature.image} alt="חתימה" className="h-24 border-b border-neutral-300 mb-2" />
              )}
              <p>
                <span className="text-neutral-500">שם: </span>
                {signature.name}
              </p>
              {Object.entries(signature.fields ?? {}).map(([k, v]) => (
                <p key={k}>
                  <span className="text-neutral-500">{SIGNER_FIELDS.find((f) => f.id === k)?.label ?? k}: </span>
                  {v}
                </p>
              ))}
              {signature.signedAt && (
                <p>
                  <span className="text-neutral-500">נחתם: </span>
                  {new Date(signature.signedAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}
                </p>
              )}
              {signature.contentHash && (
                <p className="text-xs text-neutral-400 break-all pt-2" dir="ltr">
                  Document fingerprint (SHA-256): {signature.contentHash}
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
