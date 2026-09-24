import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChipMultiSelect, Field, NativeSelect, TextInput } from "@/components/app/ui-kit";
import {
  ACCOMMODATION_COUNT_BANDS, AP_BUSINESS_TYPES, AP_GOALS, MARKETS, isHttpsUrl,
  type AccommodationCountBand, type ApBusinessType, type ApGoal,
} from "@/lib/constants";
import { meQueryKey } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { Database } from "@/integrations/supabase/types";
import { SettingsSection, mySettingsKey } from "./shared";

type Profile = { first_name: string | null; last_name: string | null; company_name: string | null; country: string | null };
type ApProfile = Database["public"]["Tables"]["accommodation_partner_profiles"]["Row"];

type Form = {
  first_name: string; last_name: string; company_name: string; country: string;
  business_type: ApBusinessType; website: string; band: AccommodationCountBand; goals: ApGoal[];
};

function formError(f: Form): string | null {
  if (!f.first_name.trim() || !f.last_name.trim()) return "Enter your first and last name";
  if (!f.company_name.trim()) return "Enter your company name";
  if (f.website.trim() && !isHttpsUrl(f.website.trim())) return "Website must be a valid https:// URL";
  if (f.goals.length === 0) return "Select at least one goal";
  return null;
}

export function ApProfileSection({ profile, ap, readOnly }: { profile: Profile | null; ap: ApProfile; readOnly: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Form>({
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    company_name: profile?.company_name ?? "",
    country: profile?.country ?? "NL",
    business_type: ap.business_type,
    website: ap.website ?? "",
    band: ap.accommodation_count_band,
    goals: ap.goals,
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const websiteInvalid = !!f.website.trim() && !isHttpsUrl(f.website.trim());

  const save = useMutation({
    mutationFn: async () => {
      const e = formError(f);
      if (e) throw new Error(e);
      const { error } = await supabase.rpc("update_accommodation_partner_profile", {
        _first_name: f.first_name.trim(),
        _last_name: f.last_name.trim(),
        _company_name: f.company_name.trim(),
        _country: f.country,
        _business_type: f.business_type,
        _website: f.website.trim(),
        _count_band: f.band,
        _goals: f.goals,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: mySettingsKey("accommodation_partner") });
      qc.invalidateQueries({ queryKey: meQueryKey });
    },
    onError: (e) => toast.error(friendlyError(e, "Could not save your profile. Please try again.")),
  });

  return (
    <SettingsSection id="profile" title="Profile" description="Your contact and business details. Distribution Partners never see your name or email."
      onSave={() => save.mutate()} saving={save.isPending} disabled={readOnly}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="First name"><TextInput value={f.first_name} maxLength={80} autoComplete="given-name" onChange={(e) => set("first_name", e.target.value)} /></Field>
        <Field label="Last name"><TextInput value={f.last_name} maxLength={80} autoComplete="family-name" onChange={(e) => set("last_name", e.target.value)} /></Field>
        <Field label="Company"><TextInput value={f.company_name} maxLength={120} autoComplete="organization" onChange={(e) => set("company_name", e.target.value)} /></Field>
        <Field label="Country"><NativeSelect value={f.country} options={MARKETS} onChange={(e) => set("country", e.target.value)} /></Field>
        <Field label="Business type">
          <NativeSelect value={f.business_type} options={AP_BUSINESS_TYPES} onChange={(e) => set("business_type", e.target.value as ApBusinessType)} />
        </Field>
        <Field label="Approximate number of accommodations">
          <NativeSelect value={f.band} options={ACCOMMODATION_COUNT_BANDS} onChange={(e) => set("band", e.target.value as AccommodationCountBand)} />
        </Field>
      </div>
      <Field label="Website (optional)" {...(websiteInvalid ? { hint: "Must start with https://" } : {})}>
        <TextInput type="url" inputMode="url" placeholder="https://" maxLength={255} value={f.website}
          aria-invalid={websiteInvalid} className={websiteInvalid ? "border-destructive" : undefined}
          onChange={(e) => set("website", e.target.value)} />
      </Field>
      <div>
        <span className="mb-3 block text-[13px] font-medium">What would you primarily like to achieve?</span>
        <ChipMultiSelect options={AP_GOALS} value={f.goals} onChange={(v) => set("goals", v as ApGoal[])} />
      </div>
    </SettingsSection>
  );
}
