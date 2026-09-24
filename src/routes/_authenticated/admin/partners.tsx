import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { ExcludeDemoToggle, REACH_LABEL, fmtDate } from "@/components/admin/shared";
import { eur } from "@/components/bookings/shared";
import { distributionTypeLabel } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/admin/partners")({
  head: () => ({
    meta: [
      { title: "Distribution Partners — Vellum admin" },
      { name: "description", content: "Distribution Partners and their performance." },
      { property: "og:title", content: "Distribution Partners — Vellum admin" },
      { property: "og:description", content: "Distribution Partners and their performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const [exclude, setExclude] = useState(true);
  const q = useQuery({
    queryKey: ["admin-partners", exclude],
    queryFn: async () => { const { data, error } = await supabase.rpc("admin_partner_performance", { _exclude_demo: exclude }); if (error) throw error; return data; },
  });
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Distribution Partners" description="Links, unique clicks and confirmed bookings per partner, all time."
        actions={<ExcludeDemoToggle value={exclude} onChange={setExclude} />} />
      {q.isLoading ? <Skeleton className="h-72" />
        : q.error ? <EmptyState icon={Megaphone} title="Couldn't load partners" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : !q.data!.length ? <EmptyState icon={Megaphone} title="No Distribution Partners yet" description="Partners appear here once they finish onboarding." action={exclude ? <Button variant="outline" onClick={() => setExclude(false)}>Include demo data</Button> : undefined} />
        : (
          <DataTable columns={["Partner", "Reach", "Joined", "Links", "Unique clicks", "Bookings", "Booking value", "Earned"]}
            rows={q.data!.map((p) => [
              <div key="n"><p className="font-medium">{p.brand_name}</p><p className="text-[12px] text-muted-foreground">{distributionTypeLabel(p.distribution_type)} · {p.markets.slice(0, 3).join(", ")}{p.is_demo ? " · demo" : ""}</p></div>,
              <span key="r">{REACH_LABEL[p.reach_band]}</span>,
              <div key="j"><p className="text-sm">{fmtDate(p.joined_at)}</p>{p.first_link_at && <p className="text-[12px] text-muted-foreground">1st link {fmtDate(p.first_link_at)}</p>}</div>,
              <span key="l" className="tabular-nums">{Number(p.links)}</span>,
              <span key="c" className="tabular-nums">{Number(p.unique_clicks).toLocaleString("en-IE")}</span>,
              <span key="b" className="tabular-nums">{Number(p.bookings)}</span>,
              <span key="v" className="tabular-nums">{eur(p.booking_value)}</span>,
              <span key="e" className="tabular-nums">{eur(p.partner_commission)}</span>,
            ])} />
        )}
    </div>
  );
}
