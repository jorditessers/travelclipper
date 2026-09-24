import { friendlyError } from "@/lib/errors";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, DataTable, EmptyState, Field, PageHeader, Skeleton, TextInput } from "@/components/app/ui-kit";
import { BookingStatusBadge, eur, fmtDay, stayRange, type BookingStatus } from "@/components/bookings/shared";
import { RegisterBookingDialog } from "@/components/bookings/RegisterBookingDialog";

export const Route = createFileRoute("/_authenticated/accommodation/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Vellum" },
      { name: "description", content: "Attributed bookings and their commission snapshots." },
      { property: "og:title", content: "Bookings — Vellum" },
      { property: "og:description", content: "Attributed bookings and their commission snapshots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type Row = {
  id: string; partner_id: string; tracking_code: string | null; source: string; traveler_reference: string | null;
  booking_date: string; check_in: string; check_out: string; guests: number; booking_value: number; status: BookingStatus;
  commission_pool_pct: number | null; partner_share_of_pool: number | null; commission_total: number | null;
  partner_commission: number | null; platform_commission: number | null; rejection_reason: string | null; notes: string | null;
  accommodations: { name: string } | null; brand: string;
};

function Page() {
  const q = useQuery({
    queryKey: ["owner-bookings"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("bookings")
        .select("*, accommodations!inner(name, owner_id)").eq("accommodations.owner_id", u.user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set(data.map((b) => b.partner_id))];
      const brands = new Map<string, string>();
      await Promise.all(ids.map(async (id) => {
        const { data: p } = await supabase.rpc("get_partner_public_profile", { _partner_id: id });
        brands.set(id, p?.[0]?.brand_name ?? "Distribution Partner");
      }));
      return data.map((b) => ({ ...b, brand: brands.get(b.partner_id)! })) as unknown as Row[];
    },
  });

  const rows = q.data ?? [];
  const inbox = rows.filter((b) => b.status === "reported");
  const rest = rows.filter((b) => b.status !== "reported");
  const register = <RegisterBookingDialog trigger={<Button><Plus className="size-4" /> Register attributed booking</Button>} />;

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Accommodation" title="Bookings" description="Bookings attributed to Distribution Partners, with the commission snapshot taken at confirmation." actions={register} />
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
        : q.error ? <EmptyState icon={BookOpen} title="Couldn't load bookings" description="We couldn't load this right now. Check your connection and try again."
            action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : (
          <>
            <section className="space-y-4">
              <h2 className="font-display text-2xl">Needs your review</h2>
              {inbox.length === 0
                ? <p className="text-sm text-muted-foreground">Nothing to review. Bookings reported by partners appear here.</p>
                : <div className="grid gap-4 lg:grid-cols-2">{inbox.map((b) => <ReviewCard key={b.id} b={b} />)}</div>}
            </section>
            <section className="space-y-4">
              <h2 className="font-display text-2xl">All bookings</h2>
              {rest.length === 0 ? <EmptyState icon={BookOpen} title="No bookings yet" description="Confirmed and registered bookings will show here." action={register} /> : (
                <DataTable
                  columns={["Stay · Partner", "Dates", "Value", "Pool", "Partner share", "Platform fee", "Status", ""]}
                  rows={rest.map((b) => [
                    <div key="s"><p className="font-medium">{b.accommodations?.name}</p>
                      <p className="text-[12px] text-muted-foreground">{b.brand}{b.tracking_code ? ` · ${b.tracking_code}` : ""}</p></div>,
                    <span key="d" className="whitespace-nowrap">{stayRange(b.check_in, b.check_out)}</span>,
                    <span key="v" className="tabular-nums">{eur(b.booking_value)}</span>,
                    <span key="p" className="tabular-nums">{eur(b.commission_total)}{b.commission_pool_pct != null && <span className="text-muted-foreground"> · {Number(b.commission_pool_pct)}%</span>}</span>,
                    <span key="ps" className="tabular-nums">{eur(b.partner_commission)}</span>,
                    <span key="pf" className="tabular-nums">{eur(b.platform_commission)}</span>,
                    <div key="st"><BookingStatusBadge status={b.status} view="owner" />
                      {b.rejection_reason && <p className="mt-1 max-w-[24ch] text-[12px] text-muted-foreground">{b.rejection_reason}</p>}</div>,
                    b.status === "confirmed" ? <CancelButton key="c" id={b.id} /> : <span key="c" />,
                  ])}
                />
              )}
            </section>
          </>
        )}
    </div>
  );
}

function ReviewCard({ b }: { b: Row }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(String(b.booking_value));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: async (confirm: boolean) => {
      if (confirm && !(Number(value) > 0)) throw new Error("Enter the final booking value.");
      if (!confirm && reason.trim().length < 3) throw new Error("A reason is required.");
      const { error } = await supabase.rpc("review_booking", { _booking_id: b.id, _confirm: confirm, _final_value: Number(value), _reason: reason });
      if (error) throw error;
      return confirm;
    },
    onSuccess: (c) => { toast.success(c ? "Booking confirmed" : "Booking rejected"); qc.invalidateQueries({ queryKey: ["owner-bookings"] }); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{b.accommodations?.name}</p>
          <p className="text-sm text-muted-foreground">Reported by {b.brand} on {fmtDay(b.booking_date)}</p>
        </div>
        <BookingStatusBadge status={b.status} view="owner" />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Stay</dt><dd>{stayRange(b.check_in, b.check_out)}</dd>
        <dt className="text-muted-foreground">Guests</dt><dd>{b.guests}</dd>
        <dt className="text-muted-foreground">Traveler</dt><dd>{b.traveler_reference || "—"}</dd>
        <dt className="text-muted-foreground">Estimated value</dt><dd>{eur(b.booking_value)}</dd>
      </dl>
      {b.notes && <p className="rounded-xl bg-mist/50 p-3 text-sm">{b.notes}</p>}
      {!rejecting ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1"><Field label="Final booking value (EUR)">
            <TextInput inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} /></Field></div>
          <Button onClick={() => m.mutate(true)} disabled={m.isPending}>Confirm</Button>
          <Button variant="ghost" onClick={() => setRejecting(true)}>Reject</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Field label="Reason (shown to the partner)">
            <textarea className="field min-h-20" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="No matching reservation found." />
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => m.mutate(false)} disabled={m.isPending}>Reject booking</Button>
            <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function CancelButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc("cancel_booking", { _booking_id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Booking cancelled"); qc.invalidateQueries({ queryKey: ["owner-bookings"] }); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  return (
    <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => {
      const r = prompt("Why was this booking cancelled?");
      if (r) m.mutate(r);
    }}>Cancel</Button>
  );
}
