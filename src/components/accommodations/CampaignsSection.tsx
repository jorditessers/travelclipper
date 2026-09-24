import { ConfirmAction } from "@/components/app/ConfirmAction";
import { friendlyError } from "@/lib/errors";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Field, Skeleton, TextInput } from "@/components/app/ui-kit";
import { isLive, shortDate, todayISO } from "@/lib/campaigns";
import { cn } from "@/lib/utils";

type Row = {
  id: string; name: string; commission_pool_pct: number; starts_on: string; ends_on: string; description: string | null;
};
type Draft = { id?: string; name: string; pct: string; starts_on: string; ends_on: string; description: string };

const empty = (): Draft => ({ name: "", pct: "", starts_on: todayISO(), ends_on: todayISO(), description: "" });
const addDays = (iso: string, d: number) => {
  const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10);
};

export function CampaignsSection({ accommodationId, standardPct, partnerShare }: {
  accommodationId: string; standardPct: number | null; partnerShare: number;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const key = ["campaigns", accommodationId];

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("commission_campaigns")
        .select("id, name, commission_pool_pct, starts_on, ends_on, description")
        .eq("accommodation_id", accommodationId).order("starts_on", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["effective-pct", accommodationId] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const pct = Number(d.pct.replace(",", "."));
      if (!d.name.trim()) throw new Error("Give the campaign a name.");
      if (Number.isNaN(pct) || pct > 30) throw new Error("Campaign commission must be 30% or lower.");
      if (standardPct != null && pct <= standardPct) throw new Error(`Campaign commission must be higher than your standard ${standardPct}%.`);
      if (d.ends_on < d.starts_on) throw new Error("End date must be on or after the start date.");
      const payload = {
        name: d.name.trim(), commission_pool_pct: pct, starts_on: d.starts_on, ends_on: d.ends_on,
        description: d.description.trim() || null,
      };
      const { error } = d.id
        ? await supabase.from("commission_campaigns").update(payload).eq("id", d.id)
        : await supabase.from("commission_campaigns").insert({ ...payload, accommodation_id: accommodationId });
      if (error) throw error;
      return !!d.id;
    },
    onSuccess: (edited) => { toast.success(edited ? "Campaign updated" : "Campaign created"); setDraft(null); refresh(); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const end = useMutation({
    mutationFn: async (c: Row) => {
      const today = todayISO();
      // Not started yet → remove. Running → end yesterday so it stops today.
      const { error } = c.starts_on >= today
        ? await supabase.from("commission_campaigns").delete().eq("id", c.id)
        : await supabase.from("commission_campaigns").update({ ends_on: addDays(today, -1) }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campaign ended"); refresh(); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const today = todayISO();
  const earn = (p: number) => Math.round(Number(p) * partnerShare * 10) / 10;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-xl">Campaigns</h3>
          <p className="mt-1 max-w-[56ch] text-sm text-muted-foreground">
            Temporarily raise your commission, for example for low season or last-minute dates. Partners see a Boost badge while it runs.
          </p>
        </div>
        {!draft && (
          <Button variant="outline" disabled={standardPct == null} onClick={() => setDraft(empty())}>New campaign</Button>
        )}
      </div>
      {standardPct == null && <p className="text-sm text-muted-foreground">Save a standard commission first.</p>}

      {draft && (
        <div className="space-y-4 rounded-2xl border border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><TextInput maxLength={60} value={draft.name} placeholder="September Boost"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Commission pool (%)" hint={standardPct != null ? `Higher than your standard ${standardPct}%, max 30%.` : "Max 30%."}>
              <TextInput inputMode="decimal" value={draft.pct} onChange={(e) => setDraft({ ...draft, pct: e.target.value.replace(/[^\d.,]/g, "") })} />
            </Field>
            <Field label="Starts on"><TextInput type="date" value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} /></Field>
            <Field label="Ends on"><TextInput type="date" min={draft.starts_on} value={draft.ends_on} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} /></Field>
          </div>
          <Field label="Description (optional)" hint="Shown to partners on the opportunity page.">
            <textarea className="field min-h-20" maxLength={280} value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Extra commission for stays in September." />
          </Field>
          {draft.pct && !Number.isNaN(Number(draft.pct.replace(",", "."))) && (
            <p className="text-sm">Distribution Partners earn <span className="font-medium">{earn(Number(draft.pct.replace(",", ".")))}%</span> during this campaign.</p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>{save.isPending ? "Saving…" : draft.id ? "Save changes" : "Create campaign"}</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {q.isLoading ? <Skeleton className="h-24" /> : q.error ? (
        <EmptyState icon={Sparkles} title="Couldn't load campaigns" description="We couldn't load this right now. Check your connection and try again."
          action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
      ) : !q.data?.length ? (
        !draft && <p className="text-sm text-muted-foreground">No campaigns yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {q.data.map((c) => {
            const live = isLive(c, today);
            const past = c.ends_on < today;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {c.name}
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-normal",
                      live ? "bg-clay/10 text-clay" : past ? "bg-mist text-ink/50" : "bg-moss/10 text-moss")}>
                      {live ? "Live" : past ? "Ended" : "Scheduled"}
                    </span>
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {Number(c.commission_pool_pct)}% pool · partners earn {earn(c.commission_pool_pct)}% · {shortDate(c.starts_on)} – {shortDate(c.ends_on)}
                  </p>
                </div>
                {!past && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDraft({
                      id: c.id, name: c.name, pct: String(Number(c.commission_pool_pct)), starts_on: c.starts_on, ends_on: c.ends_on, description: c.description ?? "",
                    })}>Edit</Button>
                    <ConfirmAction title={live ? "End this campaign today?" : "Remove this scheduled campaign?"}
                      description={live ? "Partners will earn the standard commission again from tomorrow." : "The campaign will be deleted before it starts."}
                      confirmLabel={live ? "End campaign" : "Remove campaign"} onConfirm={() => end.mutate(c)}
                      trigger={<Button size="sm" variant="outline" disabled={end.isPending}>End</Button>} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
