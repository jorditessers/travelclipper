import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { fillLegal, formatLegalVersion, legalValue, type LEGAL_ENTITY } from "@/lib/legal";
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

export function CompanyDetails({ fields }: { fields: (keyof typeof LEGAL_ENTITY)[] }) {
  const label: Record<string, string> = { legalName: "Exploitant", address: "Adres", coc: "KvK", vat: "Btw", email: "E-mail", website: "Website", platformName: "Platform" };
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl border bg-paper/60 p-5 text-sm">
      {fields.map((f) => (
        <div key={f} className="contents">
          <dt className="text-ink/50">{label[f]}</dt>
          <dd className="text-ink/80">{f === "email" ? <a className="underline underline-offset-2" href={`mailto:${legalValue(f)}`}>{legalValue(f)}</a> : legalValue(f)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LegalPage({ title, subtitle, version, blocks, intro }: {
  title: string; subtitle: string; version: string; blocks: LegalBlock[]; intro?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 md:py-20">
        <Link to="/" className="text-sm text-ink/60 hover:text-ink">← {legalValue("platformName")}</Link>
        <p className="eyebrow mt-8">{subtitle}</p>
        <h1 className="mt-3 font-display text-4xl md:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-ink/50">Versie: {formatLegalVersion(version)}</p>
        {intro && <div className="mt-8">{intro}</div>}
        <div className="mt-10 space-y-4 leading-relaxed text-ink/80">
          {group(blocks).map((g, i) =>
            g.kind === "h2" ? <h2 key={i} className="pt-6 font-display text-2xl text-ink">{fillLegal(g.text)}</h2>
            : g.kind === "h3" ? <h3 key={i} className="pt-2 font-medium text-ink">{fillLegal(g.text)}</h3>
            : g.kind === "ul" ? <ul key={i} className="list-disc space-y-1 pl-6">{g.items.map((x, j) => <li key={j}>{fillLegal(x)}</li>)}</ul>
            : <p key={i}>{fillLegal(g.text)}</p>,
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
