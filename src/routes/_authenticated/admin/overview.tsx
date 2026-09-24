import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, KpiCard, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { ExcludeDemoToggle } from "@/components/admin/shared";
import { eur } from "@/components/bookings/shared";
import { ACCOMMODATION_STATUS_LABEL, distributionTypeLabel, type AccommodationStatus, type DistributionType } from "@/lib/constants";
import { isLocalDemo } from "@/integrations/demo-backend/mode";

export const Route = createFileRoute("/_authenticated/admin/overview")({
  validateSearch: zodValidator(z.object({ demo: fallback(z.boolean(), false).default(false) })),
  head: () => ({
    meta: [
      { title: "Admin overview — Vellum" },
      { name: "description", content: "Platform totals and MVP hypothesis validation." },
      { property: "og:title", content: "Admin overview — Vellum" },
      { property: "og:description", content: "Platform totals and MVP hypothesis validation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Overview = {
  users: number; accommodation_partners: number; distribution_partners: number; admins: number;
  dp_by_type: Record<string, number>; accommodations_by_status: Record<string, number>; accommodations: number;
  links: number; active_links: number; unique_clicks: number; bookings: number; bookings_by_status: Record<string, number>;
  booking_volume: number; commission_total: number; partner_commission: number; platform_revenue: number;
  h_acc_eligible: number; h_acc_published_14d: number; h_dp_eligible: number; h_dp_link_14d: number; h_partners_with_confirmed: number;
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const BOOKING_LABEL: Record<string, string> = { reported: "Reported", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", rejected: "Rejected" };

function Breakdown({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <Card>
      <p className="text-sm text-muted-foreground">{title}</p>
      {items.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">None yet</p> : (
        <ul className="mt-3 space-y-1.5">
          {items.map(([k, v]) => <li key={k} className="flex justify-between text-sm"><span>{k}</span><span className="tabular-nums font-medium">{v}</span></li>)}
        </ul>
      )}
    </Card>
  );
}

function Page() {
  const { demo } = Route.useSearch();
  const navigate = Route.useNavigate();
  // Browser demo: everything is demo data, so the filter starts off (the search flag then means "exclude").
  const local = isLocalDemo();
  const exclude = local ? demo : !demo;
  const q = useQuery({
    queryKey: ["admin-overview", exclude],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_overview", { _exclude_demo: exclude });
      if (error) throw error;
      return data as unknown as Overview;
    },
  });
  const o = q.data;

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Admin" title="Overview" description="Platform totals and the MVP hypothesis at a glance."
        actions={<ExcludeDemoToggle value={exclude} onChange={(v) => navigate({ search: { demo: local ? v : !v }, replace: true })} />} />

      {q.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        : q.error ? <EmptyState icon={LayoutDashboard} title="Couldn't load the overview" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : o && (
          <>
            <section className="space-y-4">
              <h2 className="font-display text-2xl">MVP hypothesis</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <KpiCard label="Stays published within 14 days" value={pct(o.h_acc_published_14d, o.h_acc_eligible)}
                  hint={`${o.h_acc_published_14d} of ${o.h_acc_eligible} stays (created 14+ days ago or already published)`} />
                <KpiCard label="Distribution Partners with a link within 14 days" value={pct(o.h_dp_link_14d, o.h_dp_eligible)}
                  hint={`${o.h_dp_link_14d} of ${o.h_dp_eligible} partners`} />
                <KpiCard label="Partners with a confirmed booking" value={String(o.h_partners_with_confirmed)} hint="Confirmed or completed, at least one" />
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="font-display text-2xl">Platform</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Total users" value={String(o.users)} hint={`${o.admins} admin`} />
                <KpiCard label="Accommodation Partners" value={String(o.accommodation_partners)} />
                <KpiCard label="Distribution Partners" value={String(o.distribution_partners)} />
                <KpiCard label="Accommodations" value={String(o.accommodations)} />
                <KpiCard label="Tracking links" value={String(o.links)} hint={`${o.active_links} active`} />
                <KpiCard label="Unique clicks" value={Number(o.unique_clicks).toLocaleString("en-IE")} hint="Bots excluded" />
                <KpiCard label="Bookings" value={String(o.bookings)} />
                <KpiCard label="Booking volume" value={eur(o.booking_volume)} hint="Confirmed + completed" />
                <KpiCard label="Commission total" value={eur(o.commission_total)} hint={`Partners ${eur(o.partner_commission)}`} />
                <KpiCard label="Platform revenue" value={eur(o.platform_revenue)} hint="Confirmed + completed" />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Breakdown title="Distribution Partners by type" items={Object.entries(o.dp_by_type).map(([k, v]) => [distributionTypeLabel(k as DistributionType), v])} />
                <Breakdown title="Accommodations by status" items={Object.entries(o.accommodations_by_status).map(([k, v]) => [ACCOMMODATION_STATUS_LABEL[k as AccommodationStatus] ?? k, v])} />
                <Breakdown title="Bookings by status" items={Object.entries(o.bookings_by_status).map(([k, v]) => [BOOKING_LABEL[k] ?? k, v])} />
              </div>
            </section>
          </>
        )}
    </div>
  );
}
