import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { fillLegal, formatLegalVersion, legalValue, type LEGAL_ENTITY, type LegalLang } from "@/lib/legal";
import type { LegalBlock } from "@/lib/legal-content";
import { SiteFooter } from "./SiteHeader";

type Group = { kind: "h2" | "h3" | "p"; text: string } | { kind: "ul"; items: string[] };

function group(blocks: LegalBlock[]): Group[] {
  const out: Group[] = [];
  for (const [t, text] of blocks) {
    const last = out[out.length - 1];
    if (t === "li") {
      if (last?.kind === "ul") last.items.push(text);
      else out.push({ kind: "ul", items: [text] });
    } else out.push({ kind: t, text });
  }
  return out;
}

const DETAIL_LABELS: Record<LegalLang, Record<string, string>> = {
  en: { legalName: "Operator", address: "Address", coc: "Chamber of Commerce", vat: "VAT", email: "Email", website: "Website", platformName: "Platform" },
  nl: { legalName: "Exploitant", address: "Adres", coc: "KvK", vat: "Btw", email: "E-mail", website: "Website", platformName: "Platform" },
};

function CompanyDetails({ fields, lang }: { fields: (keyof typeof LEGAL_ENTITY)[]; lang: LegalLang }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl border bg-paper/60 p-5 text-sm">
      {fields.map((f) => (
        <div key={f} className="contents">
          <dt className="text-ink/50">{DETAIL_LABELS[lang][f]}</dt>
          <dd className="text-ink/80">{f === "email" ? <a className="underline underline-offset-2" href={`mailto:${legalValue(f)}`}>{legalValue(f)}</a> : legalValue(f, lang)}</dd>
        </div>
      ))}
    </dl>
  );
}

type Version = { title: string; blocks: LegalBlock[] };

/** Legal document in English, with the original Dutch text one click away. */
export function LegalPage({ en, nl, subtitle, version, companyFields }: {
  en: Version; nl: Version; subtitle: string; version: string; companyFields?: (keyof typeof LEGAL_ENTITY)[];
}) {
  const [lang, setLang] = useState<LegalLang>("en");
  const doc = lang === "en" ? en : nl;
  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <main lang={lang} className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 md:py-20">
        <div className="flex items-center justify-between gap-4 text-sm">
          <Link to="/" className="text-ink/60 hover:text-ink">← {legalValue("platformName")}</Link>
          <button type="button" onClick={() => setLang(lang === "en" ? "nl" : "en")} className="text-ink/60 underline underline-offset-2 hover:text-ink">
            {lang === "en" ? "Nederlandse versie" : "English version"}
          </button>
        </div>
        <p className="eyebrow mt-8">{subtitle}</p>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-ink/50">{lang === "en" ? "Version" : "Versie"}: {formatLegalVersion(version, lang)}</p>
        {companyFields && <div className="mt-8"><CompanyDetails fields={companyFields} lang={lang} /></div>}
        <div className="mt-10 space-y-4 leading-relaxed text-ink/80">
          {group(doc.blocks).map((g, i) =>
            g.kind === "h2" ? <h2 key={i} className="pt-6 font-display text-2xl text-ink">{fillLegal(g.text, lang)}</h2>
            : g.kind === "h3" ? <h3 key={i} className="pt-2 font-medium text-ink">{fillLegal(g.text, lang)}</h3>
            : g.kind === "ul" ? <ul key={i} className="list-disc space-y-1 pl-6">{g.items.map((x, j) => <li key={j}>{fillLegal(x, lang)}</li>)}</ul>
            : <p key={i}>{fillLegal(g.text, lang)}</p>,
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
