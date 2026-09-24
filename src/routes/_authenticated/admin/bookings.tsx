import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge, DataTable, EmptyState, Field, NativeSelect, PageHeader, Skeleton, TextInput } from "@/components/app/ui-kit";
import { ExcludeDemoToggle, NoteDialog, downloadCsv, fmtDate } from "@/components/admin/shared";
import { eur } from "@/components/bookings/shared";
import { friendlyError } from "@/lib/errors";
import type { BillingDetails } from "@/lib/billing";
import type { Database } from "@/integrations/supabase/types";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

export const Route = createFileRoute("/_authenticated/admin/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Vellum admin" },
      { name: "description", content: "All bookings, corrections and CSV export for invoicing and payouts." },
      { property: "og:title", content: "Bookings — Vellum admin" },
      { property: "og:description", content: "All bookings, corrections and CSV export for invoicing and payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const STATUSES: BookingStatus[] = ["reported", "confirmed", "completed", "cancelled", "rejected"];
const LABEL: Record<BookingStatus, string> = { reported: "Reported", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", rejected: "Rejected" };
const tone = (s: BookingStatus) => (s === "completed" || s === "confirmed" ? "moss" : s === "reported" ? "clay" : "neutral") as "moss" | "clay" | "neutral";

const billingAddress = (b: BillingDetails | null) =>
  b ? [b.address_line1, b.address_line2, `${b.postal_code} ${b.city}`, b.country].filter(Boolean).join(", ") : "";

function Page() {
  const qc = useQueryClient();
  const [exclude, setExclude] = useState(true);
  const [status, setStatus] = useState("");
  const [acc, setAcc] = useState("");
  const [month, setMonth] = useState(""); // YYYY-MM by check-out
  const [partner, setPartner] = useState("");

  const q = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("*, accommodations(name, owner_id)").order("booking_date", { ascending: false });
      if (error) throw error;
      const pids = [...new Set(data.map((b) => b.partner_id))];
      const oids = [...new Set(data.map((b) => b.accommodations?.owner_id).filter(Boolean) as string[])];
      const bids = [...new Set([...pids, ...oids])];
      const [{ data: dps }, { data: owners }, { data: bills }] = await Promise.all([
        pids.length ? supabase.from("distribution_partner_profiles").select("user_id, brand_name").in("user_id", pids) : Promise.resolve({ data: [] as { user_id: string; brand_name: string }[] }),
        oids.length ? supabase.from("profiles").select("id, company_name, email").in("id", oids) : Promise.resolve({ data: [] as { id: string; company_name: string | null; email: string | null }[] }),
        bids.length ? supabase.from("billing_details").select("*").in("user_id", bids) : Promise.resolve({ data: [] as BillingDetails[] }),
      ]);
      const brand = new Map((dps ?? []).map((d) => [d.user_id, d.brand_name]));
      const owner = new Map((owners ?? []).map((o) => [o.id, o]));
      const bill = new Map((bills ?? []).map((x) => [x.user_id, x]));
      return data.map((b) => {
        const oid = b.accommodations?.owner_id ?? "";
        return { ...b, brand: brand.get(b.partner_id) ?? "—", owner: owner.get(oid)?.company_name ?? "—", ownerEmail: owner.get(oid)?.email ?? "",
          ownerBilling: bill.get(oid) ?? null, partnerBilling: bill.get(b.partner_id) ?? null, accName: b.accommodations?.name ?? "—" };
      });
    },
  });

  const correct = useMutation({
    mutationFn: async (v: { id: string; status: BookingStatus; value: number | null; note: string }) => {
      const { error } = await supabase.rpc("admin_correct_booking", { _booking_id: v.id, _status: v.status, _booking_value: v.value as number, _note: v.note });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Booking corrected and logged"); qc.invalidateQueries({ queryKey: ["admin-bookings"] }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const all = q.data ?? [];
  const accOptions = useMemo(() => [...new Map(all.map((b) => [b.accommodation_id, b.accName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const partnerOptions = useMemo(() => [...new Map(all.map((b) => [b.partner_id, b.brand])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const months = useMemo(() => [...new Set(all.map((b) => b.check_out.slice(0, 7)))].sort().reverse(), [all]);
  const rows = all.filter((b) => (!exclude || !b.is_demo) && (!status || b.status === status) && (!acc || b.accommodation_id === acc)
    && (!partner || b.partner_id === partner) && (!month || b.check_out.startsWith(month)));

  const exportCsv = () => {
    const head = ["booking_id", "status", "accommodation", "accommodation_owner", "distribution_partner", "tracking_code", "source", "booking_date", "check_in", "check_out", "guests",
      "booking_value_eur", "commission_pool_pct", "partner_share_of_pool", "commission_total_eur", "partner_commission_eur", "platform_commission_eur", "confirmed_at", "note",
      "owner_legal_name", "owner_address", "owner_vat_number", "owner_invoice_email",
      "partner_legal_name", "partner_account_holder", "partner_iban", "partner_vat_number", "partner_bank_details_changed_at"];
    downloadCsv(`vellum-bookings${month ? `-${month}` : ""}${acc ? `-${accOptions.find(([id]) => id === acc)?.[1].replace(/\W+/g, "-").toLowerCase()}` : ""}.csv`, [head,
      ...rows.map((b) => [b.id, b.status, b.accName, b.owner, b.brand, b.tracking_code, b.source, b.booking_date, b.check_in, b.check_out, b.guests,
        b.booking_value, b.commission_pool_pct, b.partner_share_of_pool, b.commission_total, b.partner_commission, b.platform_commission, b.confirmed_at, b.rejection_reason,
        b.ownerBilling?.legal_name, billingAddress(b.ownerBilling), b.ownerBilling?.vat_number, b.ownerBilling?.invoice_email ?? b.ownerEmail,
        b.partnerBilling?.legal_name, b.partnerBilling?.account_holder, b.partnerBilling?.iban, b.partnerBilling?.vat_number, b.partnerBilling?.payout_details_updated_at])]);
    toast.success(`Exported ${rows.length} bookings`);
  };
  const sum = (k: "booking_value" | "commission_total" | "partner_commission" | "platform_commission") =>
    rows.filter((b) => b.status === "confirmed" || b.status === "completed").reduce((s, b) => s + Number(b[k] ?? 0), 0);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Bookings" description="All bookings. Corrections need a note and are logged. Export a month or a stay for manual invoicing and payouts."
        actions={<div className="flex flex-wrap items-center gap-4">
          <ExcludeDemoToggle value={exclude} onChange={setExclude} />
          <Button onClick={exportCsv} disabled={!rows.length}><Download className="size-4" /> Export CSV</Button>
        </div>} />
      <div className="flex flex-wrap gap-3">
        <NativeSelect aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}
          options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: LABEL[s] }))]} />
        <NativeSelect aria-label="Month" className="w-auto" value={month} onChange={(e) => setMonth(e.target.value)}
          options={[{ value: "", label: "All months (check-out)" }, ...months.map((m) => ({ value: m, label: new Date(`${m}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) }))]} />
        <NativeSelect aria-label="Accommodation" className="w-auto" value={acc} onChange={(e) => setAcc(e.target.value)}
          options={[{ value: "", label: "All accommodations" }, ...accOptions.map(([v, l]) => ({ value: v, label: l }))]} />
        <NativeSelect aria-label="Partner" className="w-auto" value={partner} onChange={(e) => setPartner(e.target.value)}
          options={[{ value: "", label: "All partners" }, ...partnerOptions.map(([v, l]) => ({ value: v, label: l }))]} />
      </div>
      {rows.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {rows.length} bookings · confirmed + completed: value {eur(sum("booking_value"))} · commission {eur(sum("commission_total"))} · partners {eur(sum("partner_commission"))} · platform {eur(sum("platform_commission"))}
        </p>
      )}
      {q.isLoading ? <Skeleton className="h-72" />
        : q.error ? <EmptyState icon={BookOpen} title="Couldn't load bookings" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : !rows.length ? <EmptyState icon={BookOpen} title="No bookings match" description="Try other filters, or include demo data." action={<Button variant="outline" onClick={() => { setStatus(""); setAcc(""); setMonth(""); setPartner(""); }}>Clear filters</Button>} />
        : (
          <DataTable columns={["Stay · Partner", "Stay dates", "Value", "Commission", "Partner", "Platform", "Status", ""]}
            rows={rows.map((b) => [
              <div key="s"><p className="font-medium">{b.accName}</p><p className="text-[12px] text-muted-foreground">{b.brand}{b.tracking_code ? ` · ${b.tracking_code}` : ""}{b.is_demo ? " · demo" : ""}</p></div>,
              <span key="d" className="whitespace-nowrap text-sm">{fmtDate(b.check_in)} – {fmtDate(b.check_out)}</span>,
              <span key="v" className="tabular-nums">{eur(b.booking_value)}</span>,
              <span key="c" className="tabular-nums">{b.commission_total != null ? `${eur(b.commission_total)}${b.commission_pool_pct != null ? ` (${Number(b.commission_pool_pct)}%)` : ""}` : "—"}</span>,
              <span key="p" className="tabular-nums">{b.partner_commission != null ? eur(b.partner_commission) : "—"}</span>,
              <span key="f" className="tabular-nums">{b.platform_commission != null ? eur(b.platform_commission) : "—"}</span>,
              <Badge key="st" tone={tone(b.status)}>{LABEL[b.status]}</Badge>,
              <CorrectDialog key="x" status={b.status} value={Number(b.booking_value)} pending={correct.isPending}
                onSubmit={(s, v, note) => correct.mutateAsync({ id: b.id, status: s, value: v, note })} />,
            ])} />
        )}
    </div>
  );
}

function CorrectDialog({ status, value, onSubmit, pending }: { status: BookingStatus; value: number; pending: boolean; onSubmit: (s: BookingStatus, v: number | null, note: string) => Promise<unknown> }) {
  const [next, setNext] = useState<BookingStatus>(status);
  const [val, setVal] = useState(String(value));
  const n = Number(val.replace(",", "."));
  const valid = n > 0;
  const changed = next !== status || (valid && n !== value);
  return (
    <NoteDialog title="Correct booking" description="Commission is recalculated in the database with the booking's own snapshot percentage, never with today's settings."
      confirmLabel="Save correction" pending={pending} canSubmit={valid && changed}
      onSubmit={(note) => onSubmit(next, n !== value ? n : null, note)}
      trigger={<Button size="sm" variant="outline">Correct</Button>}>
      <Field label="Status">
        <NativeSelect value={next} onChange={(e) => setNext(e.target.value as BookingStatus)} options={STATUSES.map((s) => ({ value: s, label: LABEL[s] }))} />
      </Field>
      <Field label="Booking value (EUR)">
        <TextInput inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.,]/g, ""))} />
      </Field>
    </NoteDialog>
  );
}
