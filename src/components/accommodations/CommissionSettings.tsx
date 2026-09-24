import { friendlyError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, ChipMultiSelect, EmptyState, Field, Skeleton, TextInput } from "@/components/app/ui-kit";
import { MARKETS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CampaignsSection } from "@/components/accommodations/CampaignsSection";
import { todayISO } from "@/lib/campaigns";

const PRESETS = [8, 10, 12, 15];
const eur = (n: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

export function usePlatformSettings() {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_partner_share_of_pool");
      if (error) throw error;
      return { partnerShare: Number(data ?? 0.7) };
    },
  });
}

export function CommissionSettings({ accommodationId }: { accommodationId: string }) {
  const qc = useQueryClient();
  const platform = usePlatformSettings();
  const q = useQuery({
    queryKey: ["distribution-settings", accommodationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodation_distribution_settings").select("*").eq("accommodation_id", accommodationId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const effective = useQuery({
    queryKey: ["effective-pct", accommodationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("effective_commission_pct", { _accommodation_id: accommodationId, _on_date: todayISO() });
      if (error) throw error;
      return data == null ? null : Number(data);
    },
  });
  const [pct, setPct] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [markets, setMarkets] = useState<string[]>([]);
  const [terms, setTerms] = useState("");
  const [approval, setApproval] = useState(false);
  const [example, setExample] = useState("5000");

  useEffect(() => {
    if (!q.data) return;
    const p = q.data.commission_pool_pct != null ? Number(q.data.commission_pool_pct) : null;
    setPct(p);
    setCustom(p != null && !PRESETS.includes(p) ? String(p) : "");
    setEnabled(q.data.distribution_enabled);
    setMarkets(q.data.target_markets);
    setTerms(q.data.content_usage_terms ?? "");
    setApproval(q.data.content_approval_required);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (pct == null || pct < 5 || pct > 30) throw new Error("Choose a commission between 5% and 30%.");
      const { error } = await supabase.from("accommodation_distribution_settings").upsert({
        accommodation_id: accommodationId,
        commission_pool_pct: pct,
        distribution_enabled: enabled,
        target_markets: markets,
        content_usage_terms: terms,
        content_approval_required: approval,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Distribution settings saved");
      qc.invalidateQueries({ queryKey: ["distribution-settings", accommodationId] });
      qc.invalidateQueries({ queryKey: ["submission-blockers", accommodationId] });
      qc.invalidateQueries({ queryKey: ["my-accommodations"] });
      qc.invalidateQueries({ queryKey: ["effective-pct", accommodationId] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  if (q.isLoading || platform.isLoading) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (q.error || platform.error)
    return <EmptyState icon={Percent} title="Couldn't load distribution settings" description="We couldn't load this right now. Check your connection and try again."
      action={<Button variant="outline" onClick={() => { q.refetch(); platform.refetch(); }}>Retry</Button>} />;

  const share = platform.data!.partnerShare;
  const value = Math.max(0, Number(example) || 0);
  const p = pct ?? 0;
  const pool = (value * p) / 100;
  const partner = pool * share;
  const fee = pool - partner;
  const customActive = pct != null && !PRESETS.includes(pct);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-8">
        <Card className="space-y-6">
          <div>
            <h2 className="font-display text-2xl">Set your distribution commission</h2>
            <p className="mt-1.5 max-w-[56ch] text-sm text-muted-foreground">
              This is the total commission you make available when a Distribution Partner generates a confirmed booking.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((v) => (
              <button key={v} type="button" aria-pressed={pct === v} onClick={() => { setPct(v); setCustom(""); }}
                className={cn("rounded-full border px-5 py-2 text-sm transition",
                  pct === v ? "border-ink bg-ink text-paper" : "border-border hover:border-ink/40")}>
                {v}%
              </button>
            ))}
            <div className={cn("flex items-center gap-1 rounded-full border px-3 py-1", customActive ? "border-ink" : "border-border")}>
              <input inputMode="decimal" placeholder="Custom" value={custom} aria-label="Custom commission"
                onChange={(e) => {
                  setCustom(e.target.value);
                  const n = Number(e.target.value.replace(",", "."));
                  setPct(e.target.value && !Number.isNaN(n) ? Math.round(n * 100) / 100 : null);
                }}
                className="w-16 bg-transparent py-1 text-sm outline-none" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          {pct != null && (pct < 5 || pct > 30) && <p className="text-sm text-destructive">Commission must be between 5% and 30%.</p>}
          <p className="text-sm font-medium">No booking, no distribution commission.</p>
        </Card>

        <Card className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-xl">Available for distribution</h3>
              <p className="mt-1 text-sm text-muted-foreground">Turn off to hide this stay from partners without changing its status.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Distribution enabled" />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium">Target markets</p>
            <ChipMultiSelect options={MARKETS} value={markets} onChange={setMarkets} />
          </div>
          <Field label="Content usage terms" hint="Shown to partners before they use your content.">
            <textarea className="field min-h-24" maxLength={1000} value={terms} onChange={(e) => setTerms(e.target.value)}
              placeholder="Credit @villaname. No edits to logo." />
          </Field>
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm">Partners must check with us before publishing new content</p>
            <Switch checked={approval} onCheckedChange={setApproval} aria-label="Content approval required" />
          </div>
        </Card>
        <Button onClick={() => save.mutate()} disabled={save.isPending || pct == null}>
          {save.isPending ? "Saving…" : "Save distribution settings"}
        </Button>
        <CampaignsSection accommodationId={accommodationId} partnerShare={share}
          standardPct={q.data?.commission_pool_pct != null ? Number(q.data.commission_pool_pct) : null} />
      </div>

      <Card className="h-fit space-y-5 lg:sticky lg:top-24">
        <p className="eyebrow">Example booking</p>
        <Field label="Booking value (EUR)">
          <TextInput inputMode="decimal" value={example} onChange={(e) => setExample(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>
        <dl className="divide-y divide-border text-sm">
          <Row k="Booking value" v={eur(value)} />
          <Row k={`Commission pool (${p}%)`} v={eur(pool)} />
          <Row k="Distribution Partner earns" v={eur(partner)} strong />
          <Row k="Platform fee" v={eur(fee)} />
          <Row k="You receive" v={eur(value - pool)} strong />
        </dl>
        {effective.data != null && q.data?.commission_pool_pct != null && effective.data !== Number(q.data.commission_pool_pct) && (
          <p className="rounded-xl bg-clay/5 px-3 py-2 text-[12px] text-clay">
            A campaign is live: today's pool is {effective.data}% (partners earn {Math.round(effective.data * share * 10) / 10}%).
          </p>
        )}
        <p className="text-[12px] text-muted-foreground">
          Partners earn {Math.round(share * 100)}% of the pool; the platform keeps {Math.round((1 - share) * 100)}%.
        </p>
      </Card>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn("tabular-nums", strong && "font-medium")}>{v}</dd>
    </div>
  );
}
