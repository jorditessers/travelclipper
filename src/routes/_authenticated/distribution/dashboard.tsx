import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { Bookmark, Compass, LayoutDashboard, Link2, Sparkles, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, KpiCard, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { STAY_SELECT, StayCard, toStayCards } from "@/components/distribution/stays";
import { usePlatformSettings } from "@/components/accommodations/CommissionSettings";
import { eur } from "@/components/bookings/shared";
import type { DistributionType } from "@/lib/constants";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
] as const;

const SUBTITLE: Record<DistributionType, string> = {
  creator: "Find stays that fit your audience.",
  travel_advisor: "Find the right stay for your clients.",
  boutique_agency: "Expand your curated inventory.",
  curator: "Recommend the stays you'd stake your taste on.",
  publisher: "Turn travel content into measurable bookings.",
  niche_community: "Bring stays your community will love.",
};

export const Route = createFileRoute("/_authenticated/distribution/dashboard")({
  validateSearch: zodValidator(z.object({ period: fallback(z.enum(["30", "90", "all"]), "30").default("30") })),
  head: () => ({
    meta: [
      { title: "Your Distribution Performance — Vellum" },
      { name: "description", content: "Clicks, bookings and commission from your distribution links." },
      { property: "og:title", content: "Your Distribution Performance — Vellum" },
      { property: "og:description", content: "Clicks, bookings and commission from your distribution links." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const chartConfig = {
  earned: { label: "Earned", color: "var(--color-moss, hsl(150 20% 35%))" },
  confirmed: { label: "Confirmed", color: "var(--color-clay, hsl(20 40% 60%))" },
} satisfies ChartConfig;

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

function Retry({ title, onRetry }: { title: string; onRetry: () => void }) {
  return <EmptyState icon={LayoutDashboard} title={title} description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={onRetry}>Retry</Button>} />;
}

function Page() {
  const { period } = Route.useSearch();
  const navigate = Route.useNavigate();
  const since = period === "all" ? null : new Date(Date.now() - Number(period) * 86400000).toISOString();
  const args = { _since: since as string };

  const profile = useQuery({
    queryKey: ["dp-own-type"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("distribution_partner_profiles").select("distribution_type").eq("user_id", u.user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const kpis = useQuery({
    queryKey: ["dp-kpis", period],
    queryFn: async () => { const { data, error } = await supabase.rpc("dp_dashboard_kpis", args); if (error) throw error; return data[0]!; },
  });
  const months = useQuery({
    queryKey: ["dp-months", period],
    queryFn: async () => { const { data, error } = await supabase.rpc("dp_earnings_by_month", args); if (error) throw error; return data; },
  });
  const saved = useQuery({
    queryKey: ["my-saved"],
    queryFn: async () => { const { data, error } = await supabase.rpc("get_my_saved_accommodations"); if (error) throw error; return data; },
  });
  const links = useQuery({
    queryKey: ["dp-top-links", period],
    queryFn: async () => { const { data, error } = await supabase.rpc("dp_top_links", args); if (error) throw error; return data; },
  });
  const activity = useQuery({
    queryKey: ["dp-activity"],
    queryFn: async () => { const { data, error } = await supabase.rpc("dp_recent_activity", { _limit: 15 }); if (error) throw error; return data; },
  });

  const platform = usePlatformSettings();
  const recs = useQuery({
    queryKey: ["dp-recs", platform.data?.partnerShare],
    enabled: platform.isSuccess,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.rpc("recommend_accommodations", { _partner_id: u.user!.id, _limit: 6 });
      if (error) throw error;
      if (!data.length) return [];
      const { data: rows, error: e2 } = await supabase.from("accommodations").select(STAY_SELECT).in("id", data.map((r) => r.accommodation_id));
      if (e2) throw e2;
      const cards = new Map((await toStayCards(rows, platform.data!.partnerShare)).map((c) => [c.id, c]));
      return data.filter((r) => cards.has(r.accommodation_id)).map((r) => ({ ...r, card: cards.get(r.accommodation_id)! }));
    },
  });
  const k = kpis.data;
  const chartData = (months.data ?? []).map((m) => ({
    month: new Date(m.month).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    confirmed: Number(m.confirmed), earned: Number(m.earned),
  }));

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Distribution" title="Your Distribution Performance"
        description={profile.data ? SUBTITLE[profile.data.distribution_type] : "Discover stays and earn from the bookings you generate."}
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

      {kpis.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        : kpis.error ? <Retry title="Couldn't load your numbers" onRetry={() => kpis.refetch()} />
        : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Saved opportunities" value={String(k!.saved)} />
            <KpiCard label="Active tracking links" value={String(k!.active_links)} />
            <KpiCard label="Unique clicks" value={Number(k!.unique_clicks).toLocaleString("en-IE")} hint="Bots excluded" />
            <KpiCard label="Confirmed bookings" value={String(k!.confirmed_bookings)} hint="Confirmed and completed" />
            <KpiCard label="Booking value" value={eur(k!.booking_value)} />
            <KpiCard label="Commission earned" value={eur(k!.commission_earned)} hint="Your share, confirmed and completed" />
          </div>
        )}

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Earnings overview</h2>
        {k && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><p className="text-sm text-muted-foreground">Pending review</p><p className="mt-1 font-display text-3xl tabular-nums">{eur(k.pending_commission)}</p><p className="text-[12px] text-muted-foreground">{k.pending_count} reported · estimate, awaiting the property</p></Card>
            <Card><p className="text-sm text-muted-foreground">Confirmed</p><p className="mt-1 font-display text-3xl tabular-nums">{eur(k.confirmed_commission)}</p><p className="text-[12px] text-muted-foreground">{k.confirmed_count} bookings · stay not yet completed</p></Card>
            <Card><p className="text-sm text-muted-foreground">Earned</p><p className="mt-1 font-display text-3xl tabular-nums text-moss">{eur(k.earned_commission)}</p><p className="text-[12px] text-muted-foreground">{k.earned_count} completed stays</p></Card>
          </div>
        )}
        <Card>
          <p className="mb-4 text-sm text-muted-foreground">Your commission per month (by booking date)</p>
          {months.isLoading ? <Skeleton className="h-56" />
            : months.error ? <Retry title="Couldn't load the chart" onRetry={() => months.refetch()} />
            : !chartData.length ? (
              <EmptyState icon={TrendingUp} title="Bookings generated through your distribution links will appear here."
                description="Create a tracking link on a stay you love and share it with your audience."
                action={<Button asChild><Link to="/distribution/discover"><Compass className="size-4" /> Discover stays</Link></Button>} />
            ) : (
              <ChartContainer config={chartConfig} className="h-56 w-full">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} strokeOpacity={0.3} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => `€${v}`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="earned" stackId="a" fill="var(--color-earned)" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="confirmed" stackId="a" fill="var(--color-confirmed)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Recommended for you</h2>
        {recs.isLoading || platform.isLoading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-96" />)}</div>
          : recs.error ? <Retry title="Couldn't load recommendations" onRetry={() => recs.refetch()} />
          : !recs.data!.length ? (
            <EmptyState icon={Sparkles} title="No new recommendations right now."
              description="You've seen the best matches. Browse all stays or update your niches and markets in Settings."
              action={<Button variant="outline" asChild><Link to="/distribution/discover">Discover stays</Link></Button>} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {recs.data!.map((r) => (
                <div key={r.accommodation_id} className="flex flex-col gap-2">
                  <StayCard a={r.card} />
                  {r.reasons.length > 0 && (
                    <ul className="space-y-1 px-1">
                      {r.reasons.map((t) => <li key={t} className="flex items-start gap-1.5 text-[13px] text-ink/70"><Sparkles className="mt-0.5 size-3 shrink-0 text-clay" />{t}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-display text-2xl">Saved opportunities</h2><Link to="/distribution/saved" className="text-sm text-ink/60 hover:text-ink">View all</Link></div>
          {saved.isLoading ? <Skeleton className="h-40" />
            : saved.error ? <Retry title="Couldn't load saved stays" onRetry={() => saved.refetch()} />
            : !saved.data!.length ? (
              <EmptyState icon={Bookmark} title="Save stays you'd like to promote." description="Use the bookmark on any stay to keep it here."
                action={<Button variant="outline" asChild><Link to="/distribution/discover">Discover stays</Link></Button>} />
            ) : (
              <ul className="divide-y divide-border rounded-2xl border bg-card">
                {saved.data!.slice(0, 5).map((s) => (
                  <li key={s.accommodation_id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      {s.is_available
                        ? <Link to="/distribution/opportunities/$id" params={{ id: s.accommodation_id }} className="font-medium hover:underline">{s.name}</Link>
                        : <span className="font-medium text-muted-foreground">{s.name}</span>}
                      <p className="text-sm text-muted-foreground">{[s.city, s.country].filter(Boolean).join(", ")}</p>
                    </div>
                    {!s.is_available && <span className="text-[12px] text-muted-foreground">No longer available</span>}
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-display text-2xl">Top performing links</h2><Link to="/distribution/links" className="text-sm text-ink/60 hover:text-ink">All links</Link></div>
          {links.isLoading ? <Skeleton className="h-40" />
            : links.error ? <Retry title="Couldn't load links" onRetry={() => links.refetch()} />
            : !links.data!.length ? (
              <EmptyState icon={Link2} title="Your tracking links will appear here." description="Open a stay and choose Get tracking link."
                action={<Button variant="outline" asChild><Link to="/distribution/discover">Discover stays</Link></Button>} />
            ) : (
              <ul className="divide-y divide-border rounded-2xl border bg-card">
                {links.data!.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.accommodation_name}</p>
                      <p className="text-sm text-muted-foreground"><span className="font-mono">{l.tracking_code}</span>{l.label ? ` · ${l.label}` : ""}</p>
                    </div>
                    <div className="flex gap-5 text-right text-sm tabular-nums">
                      <div><p className="font-medium">{Number(l.clicks)}</p><p className="text-[11px] text-muted-foreground">clicks</p></div>
                      <div><p className="font-medium">{Number(l.bookings)}</p><p className="text-[11px] text-muted-foreground">bookings</p></div>
                      <div><p className="font-medium">{eur(l.commission)}</p><p className="text-[11px] text-muted-foreground">earned</p></div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Recent activity</h2>
        {activity.isLoading ? <Skeleton className="h-40" />
          : activity.error ? <Retry title="Couldn't load activity" onRetry={() => activity.refetch()} />
          : !activity.data!.length ? (
            <EmptyState icon={LayoutDashboard} title="Your activity will appear here." description="Save stays, download content and create links to get started."
              action={<Button variant="outline" asChild><Link to="/distribution/discover">Discover stays</Link></Button>} />
          ) : (
            <ul className="space-y-1">
              {activity.data!.map((e) => (
                <li key={e.id + e.event_type} className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5">
                  <p className="text-sm">{describe(e)}</p>
                  <p className="shrink-0 text-[12px] text-muted-foreground">{ago(e.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

function describe(e: { event_type: string; accommodation_name: string; metadata: unknown }) {
  const m = (e.metadata ?? {}) as { count?: number; status?: string; commission?: number };
  const n = e.accommodation_name;
  switch (e.event_type) {
    case "opportunity_saved": return `You saved ${n}`;
    case "content_downloaded": return m.count && m.count > 1 ? `You downloaded ${m.count} photos of ${n}` : `You downloaded content of ${n}`;
    case "link_created": return `You created a tracking link for ${n}`;
    case "booking_reported": return `You reported a booking for ${n}`;
    case "booking_confirmed": return m.status === "completed"
      ? `Stay completed at ${n}: you earned ${eur(m.commission ?? 0)}`
      : `${n} confirmed your booking: you earn ${eur(m.commission ?? 0)}`;
    case "booking_cancelled": return m.status === "rejected" ? `${n} did not confirm a booking` : `A booking at ${n} was cancelled`;
    default: return n;
  }
}
