import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, Field, PageHeader, Skeleton, TextInput } from "@/components/app/ui-kit";
import { DemoDataCard } from "@/components/app/DemoDataCard";
import { ConfirmAction } from "@/components/app/ConfirmAction";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Vellum admin" },
      { name: "description", content: "Platform commission split and demo data." },
      { property: "og:title", content: "Settings — Vellum admin" },
      { property: "og:description", content: "Platform commission split and demo data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Settings" description="Platform commission split and demo data." />
      <PartnerShareCard />
      <DemoDataCard />
      <DemoModeCard />
    </div>
  );
}

function PartnerShareCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["platform-settings-admin"],
    queryFn: async () => { const { data, error } = await supabase.from("platform_settings").select("partner_share_of_pool, updated_at").single(); if (error) throw error; return data; },
  });
  const [val, setVal] = useState("");
  useEffect(() => { if (q.data) setVal(String(Math.round(Number(q.data.partner_share_of_pool) * 1000) / 10)); }, [q.data]);
  const n = Number(val.replace(",", "."));
  const valid = n > 0 && n < 100;
  const current = q.data ? Math.round(Number(q.data.partner_share_of_pool) * 1000) / 10 : null;
  const save = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("admin_set_partner_share", { _value: n / 100 }); if (error) throw error; },
    onSuccess: () => { toast.success("Partner share saved — applies to new confirmations only"); qc.invalidateQueries(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-display text-xl">Partner share of the commission pool</h3>
        <p className="mt-1 text-sm text-muted-foreground">Share of each pool that goes to the Distribution Partner; the rest is the platform fee. Applies only to bookings confirmed from now on — existing bookings keep their snapshot.</p>
      </div>
      {q.isLoading ? <Skeleton className="h-16" /> : q.error ? (
        <p className="text-sm text-muted-foreground">We couldn't load the current setting. <button className="underline" onClick={() => q.refetch()}>Try again</button></p>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Partner share (%)" hint={valid ? `Example: 10% pool → partner earns ${Math.round(10 * n) / 100}%, platform ${Math.round(10 * (100 - n)) / 100}%` : "Between 0 and 100"}>
            <TextInput inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.,]/g, ""))} className="w-32" />
          </Field>
          <ConfirmAction title="Change the partner share?" description={`From ${current}% to ${n}%. Only bookings confirmed after this change use the new split. The change is logged.`}
            confirmLabel="Save" onConfirm={() => save.mutate()}
            trigger={<Button disabled={!valid || n === current || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>} />
        </div>
      )}
    </Card>
  );
}

function DemoModeCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["platform-settings-demo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("demo_mode_enabled, demo_tour_accommodation_id").single();
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async (enabled: boolean) => { const { error } = await supabase.rpc("admin_set_demo_mode", { _enabled: enabled }); if (error) throw error; },
    onSuccess: (_d, enabled) => { toast.success(enabled ? "Demo mode on — demo buttons now show on the login page" : "Demo mode off"); qc.invalidateQueries(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const on = !!q.data?.demo_mode_enabled;
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-display text-xl">Demo mode</h3>
        <p className="mt-1 text-sm text-muted-foreground">Shows "View demo as Accommodation Partner / Distribution Partner" on the login page. Demo sessions are read-only, see only demo data and include a guided tour. Requires seeded demo data. The change is logged.</p>
      </div>
      {q.isLoading ? <Skeleton className="h-10" /> : q.error ? (
        <p className="text-sm text-muted-foreground">We couldn't load this setting. <button className="underline" onClick={() => q.refetch()}>Try again</button></p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm">Currently <span className="font-medium">{on ? "on" : "off"}</span>{!q.data?.demo_tour_accommodation_id && " · demo data not seeded yet"}</p>
          <ConfirmAction title={on ? "Switch demo mode off?" : "Switch demo mode on?"}
            description={on ? "The demo buttons disappear from the login page." : "Anyone on the login page can open the read-only demo."}
            confirmLabel={on ? "Switch off" : "Switch on"} onConfirm={() => save.mutate(!on)}
            trigger={<Button variant={on ? "outline" : "default"} disabled={save.isPending || (!on && !q.data?.demo_tour_accommodation_id)}>{on ? "Switch off" : "Switch on"}</Button>} />
        </div>
      )}
    </Card>
  );
}
