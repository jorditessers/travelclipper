import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { Building2, LayoutDashboard, Plus, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, DataTable, EmptyState, KpiCard, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { ACCOMMODATION_STATUS_LABEL, distributionTypeLabel, nicheLabel, type DistributionType } from "@/lib/constants";
import { eur } from "@/components/bookings/shared";
import { shortDate } from "@/lib/campaigns";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
] as const;

export const Route = createFileRoute("/_authenticated/accommodation/dashboard")({
  validateSearch: zodValidator(z.object({ period: fallback(z.enum(["30", "90", "all"]), "30").default("30") })),
  head: () => ({
    meta: [
      { title: "Dashboard — Vellum" },
      { name: "description", content: "How Distribution Partners engage with your stays." },
      { property: "og:title", content: "Dashboard — Vellum" },
      { property: "og:description", content: "How Distribution Partners engage with your stays." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const REACH_LABEL: Record<string, string> = { lt_1k: "<1k", "1k_10k": "1k–10k", "10k_50k": "10k–50k", "50k_250k": "50k–250k", "250k_plus": "250k+" };
const aType = (t: DistributionType | null) => {
  const l = t ? distributionTypeLabel(t) : "Distribution Partner";
  return `${/^[AEIOU]/i.test(l) ? "An" : "A"} ${l}`;
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

function Page() {
  const { period } = Route.useSearch();
  const navigate = Route.useNavigate();
  const since = period === "all" ? null : new Date(Date.now() - Number(period) * 86400000).toISOString();
  const args = { _since: since as string };

  const kpis = useQuery({
    queryKey: ["ap-kpis", period],
    queryFn: async () => { const { data, error } = await supabase.rpc("ap_dashboard_kpis", args); if (error) throw error; return data[0]!; },
  });
  const accs = useQuery({
    queryKey: ["ap-accs", period],
    queryFn: async () => { const { data, error } = await supabase.rpc("ap_dashboard_accommodations", args); if (error) throw error; return data; },
  });
  const partners = useQuery({
    queryKey: ["ap-partners", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ap_dashboard_partners", args);
      if (error) throw error;
      return Promise.all(data.map(async (p) => {
        const { data: prof } = await supabase.rpc("get_partner_public_profile", { _partner_id: p.partner_id });
        return { ...p, profile: prof?.[0] ?? null };
      }));
    },
  });
  const activity = useQuery({
    queryKey: ["ap-activity"],
    queryFn: async () => { const { data, error } = await supabase.rpc("ap_recent_activity", { _limit: 20 }); if (error) throw error; return data; },
  });

  const noStays = accs.isSuccess && accs.data.length === 0;
  const pendingIds = useQuery({
    queryKey: ["ap-pending-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ap_pending_booking_ids");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.id));
    },
  });
  const isPending = (m: unknown) => pendingIds.data?.has((m as { booking_id?: string } | null)?.booking_id ?? "") ?? false;

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Accommodation" title="Dashboard" description="How Distribution Partners engage with your stays."
        actions={
          <div className="flex rounded-full border border-border p-1" role="tablist" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p.value} role="tab" aria-selected={period === p.value}
                onClick={() => navigate({ search: { period: p.value }, replace: true })}
                className={cn("rounded-full px-4 py-1.5 text-sm transition", period === p.value ? "bg-ink text-paper" : "text-ink/60 hover:text-ink")}>
                {p.label}
              </button>
            ))}
          </div>
        } />

      {noStays ? (
        <EmptyState icon={Building2} title="Your distribution network starts with your first stay."
          description="Add an accommodation, set your commission and upload content — then partners can start promoting it."
          action={<Button asChild><Link to="/accommodation/accommodations/new"><Plus className="size-4" /> Add accommodation</Link></Button>} />
      ) : (
        <>
          {Number(kpis.data?.pending_reviews ?? 0) > 0 && (
            <Card className="flex flex-wrap items-center justify-between gap-4 border-clay/30 bg-clay/5">
              <div>
                <p className="font-display text-xl">{kpis.data!.pending_reviews} {Number(kpis.data!.pending_reviews) === 1 ? "booking needs" : "bookings need"} your review</p>
                <p className="text-sm text-muted-foreground">Reported by Distribution Partners. Confirm the final value or reject with a reason.</p>
              </div>
              <Button asChild><Link to="/accommodation/bookings">Review bookings</Link></Button>
            </Card>
          )}

          {kpis.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
            : kpis.error ? <EmptyState icon={LayoutDashboard} title="Couldn't load your numbers" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => kpis.refetch()}>Retry</Button>} />
            : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard label="Active accommodations" value={String(kpis.data!.active_accommodations)} />
                <KpiCard label="Distribution Partners engaged" value={String(kpis.data!.partners_engaged)} hint="Saved, downloaded, created a link or booked" />
                <KpiCard label="Unique clicks" value={Number(kpis.data!.unique_clicks).toLocaleString("en-IE")} hint="Bots excluded" />
                <KpiCard label="Confirmed bookings" value={String(kpis.data!.confirmed_bookings)} hint="Confirmed and completed" />
                <KpiCard label="Booking value generated" value={eur(kpis.data!.booking_value)} />
                <KpiCard label="Commission owed" value={eur(kpis.data!.commission_owed)} hint="Confirmed and completed bookings" />
              </div>
            )}

          <section className="space-y-4">
            <h2 className="font-display text-2xl">Your accommodations</h2>
            {accs.isLoading ? <Skeleton className="h-48" />
              : accs.error ? <EmptyState icon={Building2} title="Couldn't load accommodations" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => accs.refetch()}>Retry</Button>} />
              : (
                <DataTable
                  columns={["Accommodation", "Status", "Commission", "Partners engaged", "Clicks", "Bookings", "Booking value"]}
                  rows={accs.data!.map((a) => [
                    <Link key="n" to="/accommodation/accommodations/$id" params={{ id: a.id }} className="font-medium hover:underline">{a.name}</Link>,
                    <Badge key="s" tone={a.status === "active" ? "moss" : a.status === "pending_review" ? "clay" : "neutral"}>{ACCOMMODATION_STATUS_LABEL[a.status]}</Badge>,
                    <div key="c">
                      {a.effective_pct != null ? <span className="tabular-nums">{Number(a.effective_pct)}%</span> : <span className="text-muted-foreground">Not set</span>}
                      {a.campaign_name && <p className="inline-flex items-center gap-1 text-[12px] text-clay"><Sparkles className="size-3" />{a.campaign_name} · until {shortDate(a.campaign_ends_on!)} (std {Number(a.standard_pct)}%)</p>}
                    </div>,
                    <span key="p" className="tabular-nums">{a.partners_engaged}</span>,
                    <span key="k" className="tabular-nums">{Number(a.clicks).toLocaleString("en-IE")}</span>,
                    <span key="b" className="tabular-nums">{a.bookings}</span>,
                    <span key="v" className="tabular-nums">{eur(a.booking_value)}</span>,
                  ])}
                />
              )}
          </section>

          <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
            <section className="space-y-4">
              <h2 className="font-display text-2xl">Partners promoting your stays</h2>
              {partners.isLoading ? <Skeleton className="h-48" />
                : partners.error ? <EmptyState icon={Users} title="Couldn't load partners" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => partners.refetch()}>Retry</Button>} />
                : !partners.data!.length ? (
                  <EmptyState icon={Users} title="No partners yet in this period"
                    description="A clear commission and strong photos help partners pick your stay."
                    action={<Button variant="outline" asChild><Link to="/accommodation/accommodations">Review your stays</Link></Button>} />
                ) : (
                  <ul className="divide-y divide-border rounded-2xl border bg-card">
                    {partners.data!.map((p) => (
                      <li key={p.partner_id} className="flex flex-wrap items-start justify-between gap-4 p-5">
                        <div className="min-w-0">
                          <p className="font-medium">{p.profile?.brand_name ?? "Distribution Partner"}</p>
                          <p className="text-sm text-muted-foreground">
                            {p.profile ? distributionTypeLabel(p.profile.distribution_type) : ""}{p.profile?.reach_band ? ` · Reach ${REACH_LABEL[p.profile.reach_band]}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(p.profile?.niches ?? []).slice(0, 4).map((n) => <span key={n} className="rounded-full bg-mist px-2.5 py-0.5 text-[11px]">{nicheLabel(n)}</span>)}
                          </div>
                        </div>
                        <div className="flex gap-6 text-right text-sm">
                          <div><p className="font-display text-xl tabular-nums">{Number(p.clicks)}</p><p className="text-[12px] text-muted-foreground">clicks</p></div>
                          <div><p className="font-display text-xl tabular-nums">{Number(p.bookings)}</p><p className="text-[12px] text-muted-foreground">bookings</p></div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </section>

            <section className="space-y-4">
              <h2 className="font-display text-2xl">Recent activity</h2>
              {activity.isLoading ? <Skeleton className="h-48" />
                : activity.error ? <EmptyState icon={LayoutDashboard} title="Couldn't load activity" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => activity.refetch()}>Retry</Button>} />
                : !activity.data!.length ? (
                  <EmptyState icon={LayoutDashboard} title="No activity yet"
                    description="Partner saves, downloads, links and bookings will appear here."
                    action={<Button variant="outline" asChild><Link to="/accommodation/accommodations">Check your content</Link></Button>} />
                ) : (
                  <ul className="space-y-1">
                    {[...activity.data!].sort((x, y) => Number(isPending(y.metadata)) - Number(isPending(x.metadata))).map((e) => {
                      const review = e.event_type === "booking_reported" && isPending(e.metadata);
                      return (
                        <li key={e.id} className={cn("flex items-start justify-between gap-3 rounded-xl px-3 py-2.5", review && "bg-clay/5")}>
                          <div className="min-w-0">
                            <p className="text-sm">{describe(e)}{review && <span className="font-medium text-clay">: review needed</span>}</p>
                            <p className="text-[12px] text-muted-foreground">{ago(e.created_at)}</p>
                          </div>
                          {review && <Button size="sm" variant="outline" asChild><Link to="/accommodation/bookings">Review</Link></Button>}
                        </li>
                      );
                    })}
                  </ul>
                )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

type Ev = { event_type: string; accommodation_name: string; partner_type: DistributionType | null; metadata: unknown };
function describe(e: Ev) {
  const who = aType(e.partner_type);
  const count = (e.metadata as { count?: number } | null)?.count;
  switch (e.event_type) {
    case "opportunity_saved": return `${who} saved ${e.accommodation_name}`;
    case "content_downloaded": return count && count > 1 ? `${who} downloaded ${count} photos of ${e.accommodation_name}` : `${who} downloaded content of ${e.accommodation_name}`;
    case "link_created": return `${who} created a tracking link for ${e.accommodation_name}`;
    case "booking_reported": return `Booking reported by ${who.replace(/^A(n)? /, (m) => m.toLowerCase())} for ${e.accommodation_name}`;
    case "booking_registered": return `You registered a booking for ${e.accommodation_name}`;
    case "booking_confirmed": return `You confirmed a booking for ${e.accommodation_name}`;
    case "booking_cancelled": return `A booking for ${e.accommodation_name} was cancelled`;
    default: return e.accommodation_name;
  }
}
