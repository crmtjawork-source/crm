import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getPublicShare } from "@/lib/server/shares";
import { ShareGallery } from "@/components/share/ShareGallery";

// Public page for a shared record (property / deal). No login: the token in
// the link is the credential. Always fresh — unpublishing / expiry apply at once.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const share = await getPublicShare(supabaseAdmin(), token);
  if (!share) return { title: "הקישור אינו זמין", robots: { index: false, follow: false } };
  const cover = share.images[0];
  return {
    title: share.title,
    description: share.intro ?? share.brand.name,
    robots: { index: false, follow: false },
    openGraph: { title: share.title, description: share.intro ?? share.brand.name, images: cover ? [`/api/public/shares/${token}/file/${cover.id}`] : undefined },
  };
}

const size = (b: number | null) => (!b ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);

export default async function SharedRecordPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const share = await getPublicShare(supabaseAdmin(), token, { countView: true });
  if (!share) notFound();
  const accent = share.brand.accentColor ?? "#0f766e";
  const file = (id: string) => `/api/public/shares/${token}/file/${id}`;
  const digits = share.brand.phone?.replace(/\D/g, "") ?? "";
  const intl = digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  const cover = share.images[0];

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 pb-24" style={{ ["--accent" as string]: accent }}>
      <header className="flex items-center gap-3 px-5 py-3 bg-white border-b border-neutral-200">
        {share.brand.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={share.brand.logoUrl} alt="" className="h-9 w-auto" />}
        <span className="font-semibold">{share.brand.name}</span>
      </header>

      {cover && (
        <div className="relative h-[46vh] min-h-64 max-h-[520px] bg-neutral-200 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file(cover.id)} alt={share.title} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <h1 className="absolute bottom-0 inset-x-0 p-5 sm:px-10 text-3xl sm:text-4xl font-bold text-white drop-shadow">{share.title}</h1>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        {!cover && <h1 className="text-3xl sm:text-4xl font-bold pt-8">{share.title}</h1>}
        {share.intro && <p className="mt-5 text-lg leading-8 text-neutral-700 whitespace-pre-wrap">{share.intro}</p>}

        {share.facts.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {share.facts.map((f, i) => (
              <div key={i} className="rounded-2xl bg-white border border-neutral-200 px-4 py-3 shadow-sm">
                <dt className="text-xs text-neutral-500">{f.label}</dt>
                <dd className="mt-0.5 font-semibold break-words">
                  {f.href ? (
                    <a href={f.href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: accent }}>
                      {f.value}
                    </a>
                  ) : (
                    f.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {share.texts.map((t, i) => (
          <section key={i} className="mt-8">
            <h2 className="text-xl font-bold mb-2" style={{ color: accent }}>
              {t.label}
            </h2>
            <p className="leading-8 text-neutral-700 whitespace-pre-wrap">{t.value}</p>
          </section>
        ))}

        {share.images.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold mb-3" style={{ color: accent }}>
              גלריה
            </h2>
            <ShareGallery images={share.images.map((im) => ({ src: file(im.id), alt: im.caption ?? im.name, caption: im.caption }))} />
          </section>
        )}

        {share.documents.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl font-bold mb-3" style={{ color: accent }}>
              מסמכים
            </h2>
            <ul className="rounded-2xl bg-white border border-neutral-200 shadow-sm divide-y divide-neutral-100">
              {share.documents.map((d) => (
                <li key={d.id}>
                  <a href={file(d.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
                    <span aria-hidden>📄</span>
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-xs text-neutral-400">{size(d.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {intl && (
        <div className="fixed bottom-0 inset-x-0 p-3 bg-white/95 backdrop-blur border-t border-neutral-200 flex gap-2 justify-center">
          <a href={`https://wa.me/${intl}`} target="_blank" rel="noopener noreferrer" className="flex-1 max-w-xs text-center rounded-xl py-3 text-white font-semibold" style={{ backgroundColor: accent }}>
            דברו איתנו{share.brand.contactName ? ` · ${share.brand.contactName}` : ""}
          </a>
          <a href={`tel:+${intl}`} className="rounded-xl py-3 px-5 border border-neutral-300 font-semibold">
            חייגו
          </a>
        </div>
      )}
    </main>
  );
}
