import { friendlyError } from "@/lib/errors";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge, Field, NativeSelect, TextInput } from "@/components/app/ui-kit";

export type BookingStatus = "reported" | "confirmed" | "completed" | "cancelled" | "rejected";

export const eur = (n: number | string | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Number(n));
export const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const stayRange = (a: string, b: string) => `${fmtDay(a)} – ${fmtDay(b)}`;

const PARTNER_LABEL: Record<BookingStatus, [string, "neutral" | "moss" | "clay" | "ink" | "outline"]> = {
  reported: ["Pending review", "clay"], confirmed: ["Confirmed", "moss"], completed: ["Earned", "ink"],
  cancelled: ["Cancelled", "outline"], rejected: ["Cancelled", "outline"],
};
const OWNER_LABEL: Record<BookingStatus, [string, "neutral" | "moss" | "clay" | "ink" | "outline"]> = {
  reported: ["Needs review", "clay"], confirmed: ["Confirmed", "moss"], completed: ["Completed", "ink"],
  cancelled: ["Cancelled", "outline"], rejected: ["Rejected", "outline"],
};
export function BookingStatusBadge({ status, view }: { status: BookingStatus; view: "partner" | "owner" }) {
  const [label, tone] = (view === "partner" ? PARTNER_LABEL : OWNER_LABEL)[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export const TRAVELER_HINT = "First name or initials only — no email or phone.";
export const validTravelerRef = (t: string) => t.length <= 40 && !t.includes("@") && !/\d{4,}/.test(t);

export type StayFields = { check_in: string; check_out: string; guests: string; value: string; traveler: string; notes: string };
export const emptyStay = (): StayFields => ({ check_in: "", check_out: "", guests: "2", value: "", traveler: "", notes: "" });

export function checkStay(f: StayFields) {
  if (!f.check_in || !f.check_out) return "Choose check-in and check-out dates.";
  if (f.check_out < f.check_in) return "Check-out must be on or after check-in.";
  if (!(Number(f.guests) >= 1)) return "At least 1 guest.";
  if (!(Number(f.value) > 0)) return "Booking value must be more than €0.";
  if (!validTravelerRef(f.traveler)) return TRAVELER_HINT;
  return null;
}

export function StayFieldsForm({ f, set, valueLabel }: { f: StayFields; set: (f: StayFields) => void; valueLabel: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Check-in"><TextInput type="date" value={f.check_in} onChange={(e) => set({ ...f, check_in: e.target.value })} /></Field>
      <Field label="Check-out"><TextInput type="date" min={f.check_in} value={f.check_out} onChange={(e) => set({ ...f, check_out: e.target.value })} /></Field>
      <Field label="Guests"><TextInput type="number" min={1} value={f.guests} onChange={(e) => set({ ...f, guests: e.target.value })} /></Field>
      <Field label={valueLabel}><TextInput inputMode="decimal" value={f.value} onChange={(e) => set({ ...f, value: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
      <div className="sm:col-span-2">
        <Field label="Traveler reference (optional)" hint={TRAVELER_HINT}>
          <TextInput maxLength={40} value={f.traveler} onChange={(e) => set({ ...f, traveler: e.target.value })} placeholder="e.g. Anna K." />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Note (optional)">
          <textarea className="field min-h-20" maxLength={1000} value={f.notes} onChange={(e) => set({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

/* ---------- Route A: Distribution Partner reports a booking ---------- */
export function ReportBookingDialog({ accommodationId, trigger }: { accommodationId?: string; trigger: ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [acc, setAcc] = useState(accommodationId ?? "");
  const [f, setF] = useState<StayFields>(emptyStay());

  const stays = useQuery({
    queryKey: ["reportable-stays"],
    enabled: open && !accommodationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("accommodations").select("id, name").eq("status", "active").order("name");
      if (error) throw error;
      return data;
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      if (!acc) throw new Error("Choose a stay.");
      const err = checkStay(f); if (err) throw new Error(err);
      const { error } = await supabase.rpc("report_booking", {
        _accommodation_id: acc, _check_in: f.check_in, _check_out: f.check_out, _guests: Number(f.guests),
        _booking_value: Number(f.value), _traveler_reference: f.traveler, _notes: f.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking reported — the property will review it");
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      setOpen(false); setF(emptyStay()); if (!accommodationId) setAcc("");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Report a booking</DialogTitle>
          <DialogDescription>The property confirms the final value. You earn commission once it's confirmed.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          {!accommodationId && (
            <Field label="Stay">
              <NativeSelect value={acc} onChange={(e) => setAcc(e.target.value)}
                options={[{ value: "", label: stays.isLoading ? "Loading…" : "Choose a stay" }, ...(stays.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
            </Field>
          )}
          <StayFieldsForm f={f} set={setF} valueLabel="Estimated booking value (EUR)" />
          <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? "Reporting…" : "Report booking"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
