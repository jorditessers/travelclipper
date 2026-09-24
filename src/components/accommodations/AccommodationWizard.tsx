import { friendlyError } from "@/lib/errors";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GlassCard, Eyebrow } from "@/components/site/Primitives";
import { ChipMultiSelect, Field, NativeSelect, TextInput } from "@/components/app/ui-kit";
import {
  ACCOMMODATION_TYPES, MARKETS, NICHES, accommodationTypeLabel, isHttpsUrl, marketLabel, nicheLabel,
  type Accommodation, type AccommodationType, type Niche,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const STEPS = ["Basics", "Stay details", "Story", "Audience", "Links", "Review"];
const SHORT_MAX = 160;
const LONG_MAX = 5000;
const MAX_NICHES = 5;
const MAX_LABELS = 8;

type Form = {
  name: string; accommodation_type: AccommodationType | ""; country: string; region: string; city: string;
  max_guests: string; bedrooms: string; bathrooms: string; price: string;
  short_description: string; long_description: string;
  niches: Niche[]; best_suited_for: string[];
  website_url: string; booking_url: string;
};

function fromRow(a?: Accommodation | null): Form {
  return {
    name: a?.name ?? "",
    accommodation_type: a?.accommodation_type ?? "",
    country: a?.country ?? "",
    region: a?.region ?? "",
    city: a?.city ?? "",
    max_guests: a?.max_guests?.toString() ?? "",
    bedrooms: a?.bedrooms?.toString() ?? "",
    bathrooms: a?.bathrooms?.toString() ?? "",
    price: a?.starting_price_per_night?.toString() ?? "",
    short_description: a?.short_description ?? "",
    long_description: a?.long_description ?? "",
    niches: a?.niches ?? [],
    best_suited_for: a?.best_suited_for ?? [],
    website_url: a?.website_url ?? "",
    booking_url: a?.booking_url ?? "",
  };
}

const intOrNull = (v: string) => (v.trim() === "" ? null : Math.trunc(Number(v)));
const numOrNull = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100) / 100);
const textOrNull = (v: string) => (v.trim() === "" ? null : v.trim());

function toPayload(f: Form) {
  return {
    name: f.name.trim(),
    accommodation_type: f.accommodation_type || null,
    country: f.country || null,
    region: textOrNull(f.region),
    city: textOrNull(f.city),
    max_guests: intOrNull(f.max_guests),
    bedrooms: intOrNull(f.bedrooms),
    bathrooms: intOrNull(f.bathrooms),
    starting_price_per_night: numOrNull(f.price),
    short_description: textOrNull(f.short_description),
    long_description: textOrNull(f.long_description),
    niches: f.niches,
    best_suited_for: f.best_suited_for,
    website_url: textOrNull(f.website_url),
    booking_url: textOrNull(f.booking_url),
  };
}

/** Errors that block saving at all (DB constraints that apply even to drafts). */
function saveError(f: Form): string | null {
  if (!f.name.trim()) return "Add a name to save";
  if (f.max_guests && (!Number.isInteger(Number(f.max_guests)) || Number(f.max_guests) < 1)) return "Max guests must be at least 1";
  if (f.bedrooms && Number(f.bedrooms) < 0) return "Bedrooms can't be negative";
  if (f.bathrooms && Number(f.bathrooms) < 0) return "Bathrooms can't be negative";
  if (f.price && !(Number(f.price) > 0)) return "Price must be greater than 0";
  if (f.short_description.length > SHORT_MAX) return `Short description is max ${SHORT_MAX} characters`;
  if (f.website_url.trim() && !isHttpsUrl(f.website_url.trim())) return "Website must be a valid https:// URL";
  if (f.booking_url.trim() && !isHttpsUrl(f.booking_url.trim())) return "Booking URL must be a valid https:// URL";
  return null;
}

/** Per-step requirements for moving forward. */
function stepError(step: number, f: Form): string | null {
  if (step === 0) {
    if (!f.name.trim()) return "Add a name";
    if (!f.accommodation_type) return "Choose a type";
    if (!f.country) return "Choose a country";
    if (!f.region.trim() || !f.city.trim()) return "Add region and city";
  }
  if (step === 1) {
    if (!f.max_guests) return "Add max guests";
    if (!f.price) return "Add a starting price per night";
  }
  if (step === 2 && !f.short_description.trim()) return "Add a short description";
  if (step === 3 && f.niches.length > MAX_NICHES) return `Select up to ${MAX_NICHES} niches`;
  if (step === 4 && !f.website_url.trim() && !f.booking_url.trim()) return "Add a website or a direct booking URL";
  return saveError(f);
}

export function AccommodationWizard({ initial }: { initial?: Accommodation | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [id, setId] = useState<string | null>(initial?.id ?? null);
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(() => fromRow(initial));
  const [label, setLabel] = useState("");

  const save = useMutation({
    mutationFn: async (opts: { finish: boolean }) => {
      const err = saveError(f);
      if (err) throw new Error(err);
      const payload = toPayload(f);
      if (id) {
        const { error } = await supabase.from("accommodations").update(payload).eq("id", id);
        if (error) throw error;
        return { id, finish: opts.finish };
      }
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("accommodations")
        .insert({ ...payload, owner_id: u.user.id, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id, finish: opts.finish };
    },
    onSuccess: async ({ id: newId, finish }) => {
      setId(newId);
      await qc.invalidateQueries({ queryKey: ["my-accommodations"] });
      await qc.invalidateQueries({ queryKey: ["accommodation", newId] });
      toast.success(finish ? "Accommodation saved as draft" : "Draft saved");
      if (finish) navigate({ to: "/accommodation/accommodations" });
    },
    onError: (e) => toast.error(friendlyError(e, "Could not save. Please try again.")),
  });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const next = () => {
    const e = stepError(step, f);
    if (e) {
      toast.error(e);
      return;
    }
    setStep(step + 1);
  };
  const addLabel = () => {
    const l = label.trim().slice(0, 40);
    if (!l) return;
    if (f.best_suited_for.length >= MAX_LABELS) {
      toast.error(`Up to ${MAX_LABELS} labels`);
      return;
    }
    if (!f.best_suited_for.some((x) => x.toLowerCase() === l.toLowerCase())) set("best_suited_for", [...f.best_suited_for, l]);
    setLabel("");
  };
  const bad = (v: string) => !!v.trim() && !isHttpsUrl(v.trim());

  return (
    <div className="mx-auto max-w-3xl fade-up">
      <Link to="/accommodation/accommodations" className="text-sm text-ink/60 hover:text-ink">← Accommodations</Link>
      <Eyebrow className="mt-6 block">{initial ? "Edit accommodation" : "Add accommodation"} · Step {step + 1} of {STEPS.length}</Eyebrow>
      <ol className="mt-4 grid grid-cols-6 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" disabled={i > step && !id} onClick={() => setStep(i)} className="w-full text-left disabled:cursor-default" aria-current={i === step ? "step" : undefined}>
              <span className={cn("block h-1 rounded-full transition", i <= step ? "bg-moss" : "bg-ink/10")} />
              <span className={cn("mt-2 hidden text-[12px] sm:block", i === step ? "text-ink" : "text-ink/50")}>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <GlassCard size="lg" className="mt-8 space-y-5 p-6 md:p-8">
        {step === 0 && (
          <>
            <h1 className="font-display text-3xl">Basics</h1>
            <Field label="Name"><TextInput value={f.name} maxLength={120} onChange={(e) => set("name", e.target.value)} placeholder="Casa Olivo" /></Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Type">
                <NativeSelect value={f.accommodation_type} onChange={(e) => set("accommodation_type", e.target.value as AccommodationType)} options={[{ value: "", label: "Select…" }, ...ACCOMMODATION_TYPES]} />
              </Field>
              <Field label="Country">
                <NativeSelect value={f.country} onChange={(e) => set("country", e.target.value)} options={[{ value: "", label: "Select…" }, ...MARKETS]} />
              </Field>
              <Field label="Region"><TextInput value={f.region} maxLength={80} onChange={(e) => set("region", e.target.value)} placeholder="Tuscany" /></Field>
              <Field label="City"><TextInput value={f.city} maxLength={80} onChange={(e) => set("city", e.target.value)} placeholder="Montalcino" /></Field>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="font-display text-3xl">Stay details</h1>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Max guests"><TextInput type="number" min={1} step={1} value={f.max_guests} onChange={(e) => set("max_guests", e.target.value)} /></Field>
              <Field label="Starting price per night (EUR)"><TextInput type="number" min={1} step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
              <Field label="Bedrooms"><TextInput type="number" min={0} step={1} value={f.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} /></Field>
              <Field label="Bathrooms"><TextInput type="number" min={0} step={1} value={f.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} /></Field>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="font-display text-3xl">Story</h1>
            <Field label="Short description" hint={`${f.short_description.length}/${SHORT_MAX} — shown on cards`}>
              <TextInput value={f.short_description} maxLength={SHORT_MAX} onChange={(e) => set("short_description", e.target.value)} />
            </Field>
            <Field label="Full description" hint={`${f.long_description.length}/${LONG_MAX}`}>
              <textarea className="field min-h-48 resize-y" maxLength={LONG_MAX} value={f.long_description} onChange={(e) => set("long_description", e.target.value)} />
            </Field>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="font-display text-3xl">Audience</h1>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium">Niches</span>
              <span className="mb-3 block text-[12px] text-muted-foreground">{f.niches.length}/{MAX_NICHES} selected</span>
              <ChipMultiSelect options={NICHES} value={f.niches} onChange={(v) => {
                if (v.length > MAX_NICHES) { toast.error(`Select up to ${MAX_NICHES} niches`); return; }
                set("niches", v as Niche[]);
              }} />
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium">Best suited for</span>
              <span className="mb-3 block text-[12px] text-muted-foreground">Short labels, e.g. "Design lovers". Press Enter to add.</span>
              <div className="flex gap-2">
                <TextInput value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }} />
                <Button type="button" variant="outline" onClick={addLabel}>Add</Button>
              </div>
              {f.best_suited_for.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {f.best_suited_for.map((l) => (
                    <span key={l} className="inline-flex items-center gap-1 rounded-full border border-border bg-paper/60 px-3 py-1 text-[12px]">
                      {l}
                      <button type="button" aria-label={`Remove ${l}`} onClick={() => set("best_suited_for", f.best_suited_for.filter((x) => x !== l))}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h1 className="font-display text-3xl">Links</h1>
            <p className="text-sm text-ink/60">Tracking links send travelers here. Add at least one.</p>
            <Field label="Website" {...(bad(f.website_url) ? { hint: "Must start with https://" } : {})}>
              <TextInput type="url" inputMode="url" placeholder="https://" maxLength={500} value={f.website_url}
                className={bad(f.website_url) ? "border-destructive" : undefined} onChange={(e) => set("website_url", e.target.value)} />
            </Field>
            <Field label="Direct booking URL" {...(bad(f.booking_url) ? { hint: "Must start with https://" } : {})}>
              <TextInput type="url" inputMode="url" placeholder="https://" maxLength={500} value={f.booking_url}
                className={bad(f.booking_url) ? "border-destructive" : undefined} onChange={(e) => set("booking_url", e.target.value)} />
            </Field>
          </>
        )}
        {step === 5 && (
          <>
            <h1 className="font-display text-3xl">Review</h1>
            <ReviewBlock title="Basics" onEdit={() => setStep(0)}>
              <Row k="Name" v={f.name} />
              <Row k="Type" v={accommodationTypeLabel(f.accommodation_type || null)} />
              <Row k="Location" v={[f.city, f.region, f.country && marketLabel(f.country)].filter(Boolean).join(", ")} />
            </ReviewBlock>
            <ReviewBlock title="Stay details" onEdit={() => setStep(1)}>
              <Row k="Max guests" v={f.max_guests} />
              <Row k="Bedrooms / bathrooms" v={`${f.bedrooms || "–"} / ${f.bathrooms || "–"}`} />
              <Row k="From" v={f.price ? `€${Number(f.price).toFixed(2)} / night` : ""} />
            </ReviewBlock>
            <ReviewBlock title="Story" onEdit={() => setStep(2)}>
              <Row k="Short" v={f.short_description} />
              <Row k="Full" v={f.long_description ? `${f.long_description.slice(0, 200)}${f.long_description.length > 200 ? "…" : ""}` : ""} />
            </ReviewBlock>
            <ReviewBlock title="Audience" onEdit={() => setStep(3)}>
              <Row k="Niches" v={f.niches.map(nicheLabel).join(", ")} />
              <Row k="Best suited for" v={f.best_suited_for.join(", ")} />
            </ReviewBlock>
            <ReviewBlock title="Links" onEdit={() => setStep(4)}>
              <Row k="Website" v={f.website_url} />
              <Row k="Direct booking" v={f.booking_url} />
            </ReviewBlock>
          </>
        )}

        <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-6 py-4 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:pb-0 md:pt-5 md:backdrop-blur-none">
          <Button type="button" variant="ghost" disabled={step === 0 || save.isPending} onClick={() => setStep(step - 1)}>Back</Button>
          <div className="flex gap-2">
            {step < 5 && (
              <Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate({ finish: false })}>
                {save.isPending ? "Saving…" : "Save draft"}
              </Button>
            )}
            {step < 5 ? (
              <Button type="button" onClick={next}>Continue</Button>
            ) : (
              <Button type="button" size="lg" disabled={save.isPending} onClick={() => {
                for (let i = 0; i < 5; i++) {
                  const e = stepError(i, f);
                  if (e) { setStep(i); toast.error(e); return; }
                }
                save.mutate({ finish: true });
              }}>
                {save.isPending ? "Saving…" : "Save as draft"}
              </Button>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">{title}</h2>
        <button type="button" onClick={onEdit} className="text-[12px] text-ink/60 underline underline-offset-2 hover:text-ink">Edit</button>
      </div>
      <dl className="mt-2 space-y-1 text-sm">{children}</dl>
    </section>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-ink/50">{k}</dt>
      <dd className="break-words">{v || <span className="text-ink/40">—</span>}</dd>
    </div>
  );
}
