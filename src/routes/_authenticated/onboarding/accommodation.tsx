import { friendlyError } from "@/lib/errors";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GlassCard, Eyebrow } from "@/components/site/Primitives";
import { ChipMultiSelect, Field, NativeSelect, TextInput } from "@/components/app/ui-kit";
import { MARKETS } from "@/lib/constants";
import { accessQuery, homeFor } from "@/lib/access";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type BusinessType = Database["public"]["Enums"]["ap_business_type"];
type CountBand = Database["public"]["Enums"]["accommodation_count_band"];
type Goal = Database["public"]["Enums"]["ap_goal"];

export const Route = createFileRoute("/_authenticated/onboarding/accommodation")({
  head: () => ({
    meta: [
      { title: "Set up your accommodation account — Vellum" },
      { name: "description", content: "A few short steps to start reaching distribution partners." },
      { property: "og:title", content: "Set up your accommodation account — Vellum" },
      { property: "og:description", content: "A few short steps to start reaching distribution partners." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const a = await context.queryClient.ensureQueryData(accessQuery);
    if (a.role !== "accommodation_partner" || a.onboardingCompleted) throw redirect({ href: homeFor(a) });
    return { access: a };
  },
  component: Page,
});

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "individual_owner", label: "Individual Property Owner" },
  { value: "boutique_hotel", label: "Boutique Hotel" },
  { value: "independent_hotel", label: "Independent Hotel" },
  { value: "villa_management", label: "Villa Management Company" },
  { value: "bnb", label: "B&B" },
  { value: "resort", label: "Resort" },
  { value: "other", label: "Other" },
];
const BANDS: { value: CountBand; label: string }[] = [
  { value: "1", label: "1" },
  { value: "2_5", label: "2-5" },
  { value: "6_20", label: "6-20" },
  { value: "21_plus", label: "21+" },
];
const GOALS: { value: Goal; label: string }[] = [
  { value: "direct_bookings", label: "Generate more direct bookings" },
  { value: "reduce_ota_dependency", label: "Reduce dependency on OTAs" },
  { value: "new_audiences", label: "Reach new audiences" },
  { value: "travel_seller_relationships", label: "Build relationships with travel sellers" },
  { value: "fill_low_demand", label: "Fill low-demand periods" },
];
const STEPS = ["Contact", "Business", "Goals", "Terms"];
const STORE = "vellum.apOnboarding";

type Form = {
  first_name: string; last_name: string; company_name: string; country: string;
  business_type: BusinessType | ""; website: string; band: CountBand | "";
  goals: Goal[]; terms: boolean;
};
const EMPTY: Form = { first_name: "", last_name: "", company_name: "", country: "NL", business_type: "", website: "", band: "", goals: [], terms: false };

function isHttpsUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

function stepError(step: number, f: Form): string | null {
  if (step === 0) {
    if (!f.first_name.trim() || !f.last_name.trim()) return "Please enter your first and last name";
    if (!f.company_name.trim()) return "Please enter your company";
    if (!f.country) return "Please choose a country";
  }
  if (step === 1) {
    if (!f.business_type) return "Please choose a business type";
    if (f.website.trim() && !isHttpsUrl(f.website.trim())) return "Website must be a valid https:// URL";
    if (!f.band) return "Please choose the number of accommodations";
  }
  if (step === 2 && f.goals.length === 0) return "Select at least one goal";
  if (step === 3 && !f.terms) return "Please accept the commission terms";
  return null;
}

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) {
        const s = JSON.parse(raw);
        setF({ ...EMPTY, ...s.f });
        setStep(Math.min(Math.max(0, s.step ?? 0), 3));
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!done) sessionStorage.setItem(STORE, JSON.stringify({ f, step }));
  }, [f, step, done]);

  const m = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < 4; i++) {
        const e = stepError(i, f);
        if (e) { setStep(i); throw new Error(e); }
      }
      const { error } = await supabase.rpc("complete_accommodation_onboarding", {
        _first_name: f.first_name.trim(),
        _last_name: f.last_name.trim(),
        _company_name: f.company_name.trim(),
        _country: f.country,
        _business_type: f.business_type as BusinessType,
        _website: f.website.trim() || null as unknown as string,
        _count_band: f.band as CountBand,
        _goals: f.goals,
        _accept_terms: f.terms,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      sessionStorage.removeItem(STORE);
      setDone(true);
      toast.success("Onboarding complete");
    },
    onError: (e) => toast.error(friendlyError(e, "Could not save. Please try again.")),
  });

  const next = () => {
    const e = stepError(step, f);
    if (e) {
      toast.error(e);
      return;
    }
    if (step < 3) setStep(step + 1);
    else m.mutate();
  };

  const goToFirstStay = async () => {
    await qc.invalidateQueries({ queryKey: accessQuery.queryKey });
    await qc.fetchQuery(accessQuery);
    navigate({ to: "/accommodation/accommodations", replace: true });
  };

  if (done) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center fade-up">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-moss/10 text-moss">
          <Check className="size-5" />
        </div>
        <h1 className="mt-6 font-display text-4xl md:text-5xl">Your distribution network starts here.</h1>
        <div className="mt-10">
          <Button size="lg" onClick={goToFirstStay}>Add your first stay</Button>
        </div>
      </div>
    );
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const websiteInvalid = !!f.website.trim() && !isHttpsUrl(f.website.trim());

  return (
    <div className="mx-auto max-w-2xl fade-up">
      <Eyebrow>Accommodation Partner · Step {step + 1} of 4</Eyebrow>
      <ol className="mt-4 grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className="w-full text-left disabled:cursor-default"
              aria-current={i === step ? "step" : undefined}
            >
              <span className={cn("block h-1 rounded-full transition", i <= step ? "bg-moss" : "bg-ink/10")} />
              <span className={cn("mt-2 block truncate text-[11px] sm:text-[12px]", i === step ? "text-ink" : "text-ink/50")}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <GlassCard size="lg" className="mt-8 p-8">
        <form
          className="space-y-5"
          onSubmit={(e) => { e.preventDefault(); next(); }}
        >
          {step === 0 && (
            <>
              <h1 className="font-display text-3xl">Contact</h1>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="First name"><TextInput value={f.first_name} maxLength={80} onChange={(e) => set("first_name", e.target.value)} /></Field>
                <Field label="Last name"><TextInput value={f.last_name} maxLength={80} onChange={(e) => set("last_name", e.target.value)} /></Field>
              </div>
              <Field label="Company"><TextInput value={f.company_name} maxLength={120} onChange={(e) => set("company_name", e.target.value)} /></Field>
              <Field label="Country"><NativeSelect value={f.country} onChange={(e) => set("country", e.target.value)} options={MARKETS} /></Field>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="font-display text-3xl">Business</h1>
              <Field label="Business type">
                <NativeSelect
                  value={f.business_type}
                  onChange={(e) => set("business_type", e.target.value as BusinessType)}
                  options={[{ value: "", label: "Select…" }, ...BUSINESS_TYPES]}
                />
              </Field>
              <Field label="Website (optional)" {...(websiteInvalid ? { hint: "Must start with https://" } : {})}>
                <TextInput
                  type="url" inputMode="url" placeholder="https://" maxLength={255}
                  value={f.website} onChange={(e) => set("website", e.target.value)}
                  aria-invalid={websiteInvalid}
                  className={websiteInvalid ? "border-destructive" : undefined}
                />
              </Field>
              <Field label="Approximate number of accommodations">
                <div className="flex flex-wrap gap-2">
                  {BANDS.map((b) => (
                    <button
                      key={b.value} type="button" aria-pressed={f.band === b.value}
                      onClick={() => set("band", b.value)}
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-sm transition",
                        f.band === b.value ? "border-ink bg-ink text-paper" : "border-border bg-paper/60 text-foreground/70 hover:border-ink/30",
                      )}
                    >{b.label}</button>
                  ))}
                </div>
              </Field>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="font-display text-3xl">What would you primarily like to achieve?</h1>
              <p className="text-sm text-ink/60">Select all that apply.</p>
              <ChipMultiSelect options={GOALS} value={f.goals} onChange={(v) => set("goals", v as Goal[])} />
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="font-display text-3xl">Terms</h1>
              <label className="flex items-start gap-3 text-sm text-ink/80">
                <input type="checkbox" className="mt-1 accent-moss" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} />
                <span>
                  I agree to pay the commission I set on bookings attributed to a Distribution Partner through the platform.{" "}
                  <Link to="/terms" target="_blank" className="underline underline-offset-2 hover:text-moss">Read the terms</Link>
                </span>
              </label>
            </>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="ghost" disabled={step === 0 || m.isPending} onClick={() => setStep(step - 1)}>Back</Button>
            <Button type="submit" size="lg" disabled={m.isPending}>
              {step < 3 ? "Continue" : m.isPending ? "Saving…" : "Finish"}
            </Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
