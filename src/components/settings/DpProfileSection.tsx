import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChipMultiSelect, Field, NativeSelect, TextInput } from "@/components/app/ui-kit";
import {
  DISTRIBUTION_TYPES, MARKETS, NICHES, REACH_BANDS, isHttpsUrl,
  type DistributionType, type Niche, type ReachBand,
} from "@/lib/constants";
import { meQueryKey } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { SettingsSection, mySettingsKey } from "./shared";

type Profile = { first_name: string | null; last_name: string | null };
type DpProfile = Database["public"]["Tables"]["distribution_partner_profiles"]["Row"];

const MAX_NICHES = 5;
const BIO_MAX = 280;

type Form = {
  first_name: string; last_name: string; type: DistributionType; brand: string; website: string;
  socials: [string, string, string]; markets: string[]; niches: Niche[]; reach: ReachBand; bio: string;
};

function formError(f: Form): string | null {
  if (!f.brand.trim()) return "Enter your brand or company name";
  if (!isHttpsUrl(f.website.trim())) return "Website or main channel must be a valid https:// URL";
  if (f.socials.some((s) => s.trim() && !isHttpsUrl(s.trim()))) return "Social links must be valid https:// URLs";
  if (f.markets.length === 0) return "Select at least one primary market";
  if (f.niches.length === 0) return "Select at least one niche";
  if (f.niches.length > MAX_NICHES) return `Select up to ${MAX_NICHES} niches`;
  if (f.bio.length > BIO_MAX) return `Bio can be at most ${BIO_MAX} characters`;
  return null;
}

export function DpProfileSection({ profile, dp, readOnly }: { profile: Profile | null; dp: DpProfile; readOnly: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>({
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    type: dp.distribution_type,
    brand: dp.brand_name,
    website: dp.website,
    socials: [dp.social_links[0] ?? "", dp.social_links[1] ?? "", dp.social_links[2] ?? ""],
    markets: dp.markets,
    niches: dp.niches,
    reach: dp.reach_band,
    bio: dp.bio ?? "",
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const setSocial = (i: number, v: string) =>
    setF((p) => { const s = [...p.socials] as Form["socials"]; s[i] = v; return { ...p, socials: s }; });
  const websiteInvalid = !!f.website.trim() && !isHttpsUrl(f.website.trim());

  const save = useMutation({
    mutationFn: async () => {
      const e = formError(f);
      if (e) throw new Error(e);
      const { error } = await supabase.rpc("update_distribution_partner_profile", {
        _first_name: f.first_name.trim(),
        _last_name: f.last_name.trim(),
        _distribution_type: f.type,
        _brand_name: f.brand.trim(),
        _website: f.website.trim(),
        _social_links: f.socials.map((s) => s.trim()).filter(Boolean),
        _markets: f.markets,
        _niches: f.niches,
        _reach_band: f.reach,
        _bio: f.bio.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: mySettingsKey("distribution_partner") });
      qc.invalidateQueries({ queryKey: meQueryKey });
    },
    onError: (e) => toast.error(friendlyError(e, "Could not save your profile. Please try again.")),
  });

  return (
    <SettingsSection id="profile" title="Partner profile"
      description="Accommodations see this public profile when you promote their stay. They never see your name or email."
      onSave={() => save.mutate()} saving={save.isPending} disabled={readOnly}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="First name (private, optional)"><TextInput value={f.first_name} maxLength={80} autoComplete="given-name" onChange={(e) => set("first_name", e.target.value)} /></Field>
        <Field label="Last name (private, optional)"><TextInput value={f.last_name} maxLength={80} autoComplete="family-name" onChange={(e) => set("last_name", e.target.value)} /></Field>
        <Field label="Brand / company name"><TextInput value={f.brand} maxLength={120} onChange={(e) => set("brand", e.target.value)} /></Field>
        <Field label="Primary distribution type">
          <NativeSelect value={f.type} options={DISTRIBUTION_TYPES} onChange={(e) => set("type", e.target.value as DistributionType)} />
        </Field>
      </div>
      <Field label="Website or main channel URL" {...(websiteInvalid ? { hint: "Must start with https://" } : {})}>
        <TextInput type="url" inputMode="url" placeholder="https://" maxLength={255} value={f.website}
          aria-invalid={websiteInvalid} className={websiteInvalid ? "border-destructive" : undefined}
          onChange={(e) => set("website", e.target.value)} />
      </Field>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium">Social links (optional, up to 3)</span>
        <div className="space-y-2">
          {f.socials.map((s, i) => {
            const bad = !!s.trim() && !isHttpsUrl(s.trim());
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
        <ChipMultiSelect options={NICHES} value={f.niches}
          onChange={(v) => {
            if (v.length > MAX_NICHES) { toast.error(`Select up to ${MAX_NICHES} niches`); return; }
            set("niches", v as Niche[]);
          }} />
      </div>
      <div>
        <span className="mb-3 block text-[13px] font-medium">Audience / customer reach</span>
        <div className="flex flex-wrap gap-2">
          {REACH_BANDS.map((r) => (
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
    </SettingsSection>
  );
}
