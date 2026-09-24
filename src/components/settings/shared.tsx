import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/app/ui-kit";
import { useDemoSide } from "@/lib/demo";
import type { AppRole } from "@/lib/constants";

export const mySettingsKey = (role: AppRole) => ["my-settings", role] as const;

/** Everything the settings page edits, read through the user's own-row RLS policies. */
export function useMySettings(role: "accommodation_partner" | "distribution_partner") {
  return useQuery({
    queryKey: mySettingsKey(role),
    queryFn: async () => {
      const { data: u, error: uErr } = await supabase.auth.getUser();
      if (uErr || !u.user) throw uErr ?? new Error("Not signed in");
      const uid = u.user.id;
      const [profile, billing, ap, dp] = await Promise.all([
        supabase.from("profiles").select("email, first_name, last_name, company_name, country").eq("id", uid).maybeSingle(),
        supabase.from("billing_details").select("*").eq("user_id", uid).maybeSingle(),
        role === "accommodation_partner"
          ? supabase.from("accommodation_partner_profiles").select("*").eq("user_id", uid).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        role === "distribution_partner"
          ? supabase.from("distribution_partner_profiles").select("*").eq("user_id", uid).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      for (const r of [profile, billing, ap, dp]) if (r.error) throw r.error;
      return { email: u.user.email ?? profile.data?.email ?? null, profile: profile.data, billing: billing.data, ap: ap.data, dp: dp.data };
    },
  });
}

/** Demo sessions are read-only; settings show the data but cannot be saved. */
export function useIsDemoSession() {
  return !!useDemoSide().data;
}

export function SettingsSection({
  id,
  title,
  description,
  badge,
  children,
  onSave,
  saving,
  saveLabel = "Save changes",
  disabled,
}: {
  id?: string;
  title: string;
  description?: string;
  badge?: ReactNode | undefined;
  children: ReactNode;
  onSave?: (() => void) | undefined;
  saving?: boolean;
  saveLabel?: string;
  disabled?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card className="p-6 md:p-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave?.();
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-2xl">{title}</h2>
              {description && <p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">{description}</p>}
            </div>
            {badge}
          </div>
          <fieldset disabled={disabled || saving} className="mt-6 space-y-5 disabled:opacity-80">
            {children}
          </fieldset>
          {onSave && (
            <div className="mt-8 flex justify-end border-t pt-5">
              <Button type="submit" disabled={disabled || saving}>
                {saving ? "Saving…" : saveLabel}
              </Button>
            </div>
          )}
        </form>
      </Card>
    </section>
  );
}
