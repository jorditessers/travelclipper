import { friendlyError } from "@/lib/errors";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Briefcase, Camera, Gem, Newspaper, Users, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GlassCard, Eyebrow } from "@/components/site/Primitives";
import { ChipMultiSelect, Field, TextInput } from "@/components/app/ui-kit";
import { MARKETS, NICHES, REACH_BANDS, type DistributionType, type Niche, type ReachBand } from "@/lib/constants";
import { accessQuery, homeFor } from "@/lib/access";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding/distribution")({
  head: () => ({
    meta: [
      { title: "Set up your distribution profile — Vellum" },
      { name: "description", content: "Tell accommodations who you are and who you reach." },
      { property: "og:title", content: "Set up your distribution profile — Vellum" },
      { property: "og:description", content: "Tell accommodations who you are and who you reach." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const a = await context.queryClient.ensureQueryData(accessQuery);
    if (a.role !== "distribution_partner" || a.onboardingCompleted) throw redirect({ href: homeFor(a) });
    return { access: a };
  },
  component: Page,
});

const TYPES: { value: DistributionType; title: string; body: string; icon: LucideIcon }[] = [
  { value: "creator", title: "Creator", body: "Create and distribute content to an audience.", icon: Camera },
  { value: "travel_advisor", title: "Travel Advisor", body: "Recommend and book travel for individual clients.", icon: Briefcase },
  { value: "boutique_agency", title: "Boutique Agency", body: "Curate and sell travel under your own agency brand.", icon: Gem },
  { value: "curator", title: "Curator", body: "Turn expertise and taste into trusted recommendations.", icon: BookOpen },
  { value: "publisher", title: "Publisher", body: "Monetize travel content across websites, newsletters or media.", icon: Newspaper },
  { value: "niche_community", title: "Niche Community", body: "Connect a relevant community with curated travel experiences.", icon: Users },
];
const REACH = REACH_BANDS;
const STEPS = ["Distribution type", "Profile", "Terms"];
const STORE = "vellum.dpOnboarding";
const MAX_NICHES = 5;
const BIO_MAX = 280;

type Form = {
  type: DistributionType | ""; brand: string; website: string; socials: [string, string, string];
  markets: string[]; niches: Niche[]; reach: ReachBand | ""; bio: string; terms: boolean;
};
const EMPTY: Form = { type: "", brand: "", website: "", socials: ["", "", ""], markets: [], niches: [], reach: "", bio: "", terms: false };

const isHttps = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
};

function stepError(step: number, f: Form): string | null {
  if (step === 0 && !f.type) return "Choose your primary distribution type";
  if (step === 1) {
    if (!f.brand.trim()) return "Enter your brand or company name";
    if (!isHttps(f.website.trim())) return "Website or main channel must be a valid https:// URL";
    if (f.socials.some((s) => s.trim() && !isHttps(s.trim()))) return "Social links must be valid https:// URLs";
    if (f.markets.length === 0) return "Select at least one primary market";
    if (f.niches.length === 0) return "Select at least one niche";
    if (f.niches.length > MAX_NICHES) return `Select up to ${MAX_NICHES} niches`;
    if (!f.reach) return "Choose your audience or customer reach";
    if (f.bio.length > BIO_MAX) return `Bio can be at most ${BIO_MAX} characters`;
  }
  if (step === 2 && !f.terms) return "Please accept the commission terms";
  return null;
}

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) {
        const s = JSON.parse(raw);
        setF({ ...EMPTY, ...s.f });
        setStep(Math.min(Math.max(0, s.step ?? 0), 2));
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    sessionStorage.setItem(STORE, JSON.stringify({ f, step }));
  }, [f, step]);

  const m = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < 3; i++) {
        const e = stepError(i, f);
        if (e) { setStep(i); throw new Error(e); }
      }
      const { error } = await supabase.rpc("complete_distribution_onboarding", {
        _distribution_type: f.type as DistributionType,
        _brand_name: f.brand.trim(),
        _website: f.website.trim(),
        _social_links: f.socials.map((s) => s.trim()).filter(Boolean),
        _markets: f.markets,
        _niches: f.niches,
        _reach_band: f.reach as ReachBand,
        _bio: f.bio.trim(),
        _accept_terms: f.terms,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      sessionStorage.removeItem(STORE);
      await qc.invalidateQueries({ queryKey: accessQuery.queryKey });
      const a = await qc.fetchQuery(accessQuery);
      toast.success("Your partner profile is ready");
      navigate({ href: homeFor(a), replace: true });
    },
    onError: (e) => toast.error(friendlyError(e, "Could not save. Please try again.")),
  });

  const next = () => {
    const e = stepError(step, f);
    if (e) {
      toast.error(e);
      return;
    }
    if (step < 2) setStep(step + 1);
    else m.mutate();
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const setSocial = (i: number, v: string) =>
    setF((p) => { const s = [...p.socials] as Form["socials"]; s[i] = v; return { ...p, socials: s }; });
  const websiteInvalid = !!f.website.trim() && !isHttps(f.website.trim());

  return (
    <div className="mx-auto max-w-3xl fade-up">
      <Eyebrow>Distribution Partner · Step {step + 1} of 3</Eyebrow>
      <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)} className="w-full text-left disabled:cursor-default" aria-current={i === step ? "step" : undefined}>
              <span className={cn("block h-1 rounded-full transition", i <= step ? "bg-moss" : "bg-ink/10")} />
              <span className={cn("mt-2 block truncate text-[11px] sm:text-[12px]", i === step ? "text-ink" : "text-ink/50")}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <form className="mt-8" onSubmit={(e) => { e.preventDefault(); next(); }}>
        {step === 0 && (
          <>
            <h1 className="font-display text-3xl md:text-4xl">What's your primary distribution type?</h1>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {TYPES.map((t) => (
                <button key={t.value} type="button" aria-pressed={f.type === t.value} onClick={() => set("type", t.value)} className="text-left">
                  <GlassCard className={cn("h-full p-5 transition", f.type === t.value && "ring-2 ring-moss")}>
                    <t.icon className="size-5 text-moss" />
                    <h2 className="mt-3 font-display text-xl">{t.title}</h2>
                    <p className="mt-1 text-sm text-ink/60">{t.body}</p>
                  </GlassCard>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <GlassCard size="lg" className="space-y-6 p-8">
            <h1 className="font-display text-3xl">Profile</h1>
            <Field label="Brand / company name">
              <TextInput value={f.brand} maxLength={120} onChange={(e) => set("brand", e.target.value)} />
            </Field>
            <Field label="Website or main channel URL" {...(websiteInvalid ? { hint: "Must start with https://" } : {})}>
              <TextInput type="url" inputMode="url" placeholder="https://" maxLength={255} value={f.website}
                aria-invalid={websiteInvalid} className={websiteInvalid ? "border-destructive" : undefined}
                onChange={(e) => set("website", e.target.value)} />
            </Field>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium">Social links (optional, up to 3)</span>
              <div className="space-y-2">
                {f.socials.map((s, i) => {
                  const bad = !!s.trim() && !isHttps(s.trim());
                  return (
                    <TextInput key={i} type="url" inputMode="url" placeholder="https://" maxLength={255} value={s}
                      aria-label={`Social link ${i + 1}`} aria-invalid={bad} className={bad ? "border-destructive" : undefined}
                      onChange={(e) => setSocial(i, e.target.value)} />
                  );
                })}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium">Primary markets</span>
              <span className="mb-3 block text-[12px] text-muted-foreground">Where your audience or clients are based.</span>
              <ChipMultiSelect options={MARKETS} value={f.markets} onChange={(v) => set("markets", v)} />
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium">Main travel niches</span>
              <span className="mb-3 block text-[12px] text-muted-foreground">{f.niches.length}/{MAX_NICHES} selected</span>
              <ChipMultiSelect
                options={NICHES}
                value={f.niches}
                onChange={(v) => {
                  if (v.length > MAX_NICHES) { toast.error(`Select up to ${MAX_NICHES} niches`); return; }
                  set("niches", v as Niche[]);
                }}
              />
            </div>
            <div>
              <span className="mb-3 block text-[13px] font-medium">Audience / customer reach</span>
              <div className="flex flex-wrap gap-2">
                {REACH.map((r) => (
                  <button key={r.value} type="button" aria-pressed={f.reach === r.value} onClick={() => set("reach", r.value)}
                    className={cn("rounded-full border px-4 py-1.5 text-sm transition",
                      f.reach === r.value ? "border-ink bg-ink text-paper" : "border-border bg-paper/60 text-foreground/70 hover:border-ink/30")}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Short bio" hint={`${f.bio.length}/${BIO_MAX}`}>
              <textarea className="field min-h-24 resize-y" maxLength={BIO_MAX} value={f.bio} onChange={(e) => set("bio", e.target.value)} />
            </Field>
          </GlassCard>
        )}

        {step === 2 && (
          <GlassCard size="lg" className="space-y-5 p-8">
            <h1 className="font-display text-3xl">Terms</h1>
            <label className="flex items-start gap-3 text-sm text-ink/80">
              <input type="checkbox" className="mt-1 accent-moss" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} />
              <span>
                I understand I earn commission only on confirmed bookings attributed to me.{" "}
                <Link to="/terms" target="_blank" className="underline underline-offset-2 hover:text-moss">Read the terms</Link>
              </span>
            </label>
          </GlassCard>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button type="button" variant="ghost" disabled={step === 0 || m.isPending} onClick={() => setStep(step - 1)}>Back</Button>
          <Button type="submit" size="lg" disabled={m.isPending}>
            {step < 2 ? "Continue" : m.isPending ? "Saving…" : "Finish"}
          </Button>
        </div>
      </form>
    </div>
  );
}
