import { friendlyError } from "@/lib/errors";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, NativeSelect, TextInput } from "@/components/app/ui-kit";
import { StayFieldsForm, checkStay, emptyStay, type StayFields } from "@/components/bookings/shared";
import { distributionTypeLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

const CODE_RE = /^[A-Z]{3}-[A-Z0-9]{5}$/;

export function RegisterBookingDialog({ trigger }: { trigger: ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [acc, setAcc] = useState("");
  const [mode, setMode] = useState<"code" | "partner">("code");
  const [code, setCode] = useState("");
  const [partner, setPartner] = useState("");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [f, setF] = useState<StayFields>(emptyStay());

  const stays = useQuery({
    queryKey: ["my-accommodations-min"], enabled: open,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("accommodations").select("id, name").eq("owner_id", u.user!.id).order("name");
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => { if (!acc && stays.data?.length === 1) setAcc(stays.data[0]!.id); }, [stays.data, acc]);

  const norm = code.trim().toUpperCase();
  const lookup = useQuery({
    queryKey: ["lookup-code", acc, norm], enabled: open && !!acc && mode === "code" && CODE_RE.test(norm),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lookup_tracking_code", { _accommodation_id: acc, _code: norm });
      if (error) throw error;
      const link = data[0];
      if (!link) return null;
      const { data: p } = await supabase.rpc("get_partner_public_profile", { _partner_id: link.partner_id });
      return { ...link, profile: p?.[0] ?? null };
    },
  });
  const partners = useQuery({
    queryKey: ["interacting-partners", acc], enabled: open && !!acc && mode === "partner",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_interacting_partners", { _accommodation_id: acc });
      if (error) throw error;
      return data;
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      if (!acc) throw new Error("Choose a stay.");
      if (mode === "code" && !lookup.data) throw new Error("Enter a valid tracking code for this stay.");
      if (mode === "partner" && !partner) throw new Error("Choose a partner.");
      const err = checkStay(f); if (err) throw new Error(err);
      const { error } = await supabase.rpc("register_booking", {
        _accommodation_id: acc,
        _partner_id: (mode === "partner" ? partner : lookup.data!.partner_id),
        _tracking_code: mode === "code" ? norm : "",
        _check_in: f.check_in, _check_out: f.check_out, _guests: Number(f.guests), _booking_value: Number(f.value),
        _traveler_reference: f.traveler, _notes: f.notes, _booking_date: bookingDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Booking registered and confirmed");
      qc.invalidateQueries({ queryKey: ["owner-bookings"] });
      setOpen(false); setF(emptyStay()); setCode(""); setPartner("");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Register attributed booking</DialogTitle>
          <DialogDescription>For a booking a Distribution Partner generated, e.g. by email or phone. It's confirmed right away.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label="Stay">
            <NativeSelect value={acc} onChange={(e) => { setAcc(e.target.value); setPartner(""); }}
              options={[{ value: "", label: stays.isLoading ? "Loading…" : "Choose a stay" }, ...(stays.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
          </Field>
          <div className="flex gap-2">
            {(["code", "partner"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}
                className={cn("rounded-full border px-4 py-1.5 text-sm", mode === k ? "border-ink bg-ink text-paper" : "border-border hover:border-ink/40")}>
                {k === "code" ? "Tracking code" : "Choose partner"}
              </button>
            ))}
          </div>
          {mode === "code" ? (
            <div className="space-y-2">
              <Field label="Tracking code"><TextInput value={code} maxLength={9} placeholder="VLA-7K2QX" className="font-mono uppercase"
                onChange={(e) => setCode(e.target.value)} disabled={!acc} /></Field>
              {CODE_RE.test(norm) && acc && (
                lookup.isLoading ? <p className="text-sm text-muted-foreground">Checking…</p>
                : lookup.data ? (
                  <div className="rounded-2xl border border-moss/30 bg-moss/5 p-3 text-sm">
                    <p className="font-medium">{lookup.data.profile?.brand_name ?? "Distribution Partner"}</p>
                    <p className="text-muted-foreground">{lookup.data.profile ? distributionTypeLabel(lookup.data.profile.distribution_type) : ""}{lookup.data.label ? ` · ${lookup.data.label}` : ""}</p>
                  </div>
                ) : <p className="text-sm text-destructive">This code doesn't belong to this stay.</p>
              )}
            </div>
          ) : (
            <Field label="Partner" hint="Partners who viewed, saved or created links for this stay.">
              <NativeSelect value={partner} onChange={(e) => setPartner(e.target.value)} disabled={!acc}
                options={[{ value: "", label: partners.isLoading ? "Loading…" : partners.data?.length === 0 ? "No partners yet" : "Choose a partner" },
                  ...(partners.data ?? []).map((p) => ({ value: p.partner_id, label: p.brand_name }))]} />
            </Field>
          )}
          <Field label="Booking date"><TextInput type="date" max={new Date().toISOString().slice(0, 10)} value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} /></Field>
          <StayFieldsForm f={f} set={setF} valueLabel="Booking value (EUR)" />
          <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? "Registering…" : "Register booking"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
