import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, KpiCard, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { BookingStatusBadge, ReportBookingDialog, eur, stayRange } from "@/components/bookings/shared";

export const Route = createFileRoute("/_authenticated/distribution/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Vellum" },
      { name: "description", content: "Bookings you generated and the commission you earn." },
      { property: "og:title", content: "Bookings — Vellum" },
      { property: "og:description", content: "Bookings you generated and the commission you earn." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const q = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_bookings");
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];
  const sum = (st: string[]) => rows.filter((b) => st.includes(b.status)).reduce((t, b) => t + Number(b.partner_commission ?? 0), 0);

  const report = <ReportBookingDialog trigger={<Button><Plus className="size-4" /> Report a booking</Button>} />;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Distribution" title="Bookings" description="Bookings you generated. You earn commission once the property confirms." actions={report} />
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
        : q.error ? <EmptyState icon={BookOpen} title="Couldn't load your bookings" description="We couldn't load this right now. Check your connection and try again."
            action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : !rows.length ? <EmptyState icon={BookOpen} title="Bookings generated through your distribution links will appear here." description="When a traveler books through you, report it here or ask the property to register it with your tracking code." action={report} />
        : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard label="Pending review" value={String(rows.filter((b) => b.status === "reported").length)} />
              <KpiCard label="Confirmed commission" value={eur(sum(["confirmed"]))} />
              <KpiCard label="Earned" value={eur(sum(["completed"]))} />
            </div>
            <DataTable
              columns={["Stay", "Dates", "Guests", "Traveler", "Status", "You earn"]}
              rows={rows.map((b) => [
                <div key="s"><p className="font-medium">{b.accommodation_name}</p>
                  <p className="text-[12px] text-muted-foreground">{b.source === "partner_reported" ? "Reported by you" : "Registered by property"}{b.tracking_code ? ` · ${b.tracking_code}` : ""}</p></div>,
                <span key="d" className="whitespace-nowrap">{stayRange(b.check_in, b.check_out)}</span>,
                <span key="g">{b.guests}</span>,
                <span key="t" className="text-muted-foreground">{b.traveler_reference || "—"}</span>,
                <div key="st"><BookingStatusBadge status={b.status} view="partner" />
                  {b.rejection_reason && <p className="mt-1 max-w-[28ch] text-[12px] text-muted-foreground">{b.rejection_reason}</p>}</div>,
                <span key="e" className="tabular-nums font-medium">{b.status === "reported" ? "—" : eur(b.partner_commission)}</span>,
              ])}
            />
          </>
        )}
    </div>
  );
}
