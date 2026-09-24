import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Field, NativeSelect, TextInput } from "@/components/app/ui-kit";
import {
  billingComplete, billingCountryOptions, formatIban, isValidEmail, isValidIban, isValidVat,
  normalizeIban, normalizeVat, type BillingDetails,
} from "@/lib/billing";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { SettingsSection, mySettingsKey } from "./shared";

type Role = "accommodation_partner" | "distribution_partner";

type Form = {
  is_business: boolean; legal_name: string; address_line1: string; address_line2: string; postal_code: string;
  city: string; country: string; vat_number: string; coc_number: string; invoice_email: string;
  account_holder: string; iban: string;
};

const COPY: Record<Role, { title: string; description: string; emailLabel: string; missing: string }> = {
  accommodation_partner: {
    title: "Invoicing details",
    description: "We invoice the commission on confirmed bookings to these details, once the stay is completed.",
    emailLabel: "Invoice email (optional, defaults to your login email)",
    missing: "Add your invoicing details so we can send correct invoices for commission.",
  },
  distribution_partner: {
    title: "Payout details",
    description: "We pay your earned commission to this account after the stay is completed. Only you and the platform team can see these details.",
    emailLabel: "Email for payout statements (optional, defaults to your login email)",
    missing: "Add your payout details so we can pay the commission you earn.",
  },
};

function formError(f: Form, needsPayout: boolean): string | null {
  if (!f.legal_name.trim()) return f.is_business ? "Enter the legal company name" : "Enter your full name";
  if (!f.address_line1.trim() || f.postal_code.trim().length < 2 || !f.city.trim()) return "Enter the full address";
  if (!f.country) return "Choose a country";
  if (f.vat_number.trim() && !isValidVat(f.vat_number)) return "Enter the VAT number with its country prefix, for example NL123456789B01";
  if (f.invoice_email.trim() && !isValidEmail(f.invoice_email)) return "Enter a valid email address";
  const hasIban = !!f.iban.trim();
  const hasHolder = !!f.account_holder.trim();
  if (needsPayout && (!hasIban || !hasHolder)) return "Enter the account holder and IBAN so we can pay your commission";
  if (hasIban && !isValidIban(f.iban)) return "This IBAN is not valid. Check it for typos.";
  if (hasIban !== hasHolder) return "Enter both the account holder and the IBAN";
  return null;
}

export function BillingSection({ role, billing, readOnly }: { role: Role; billing: BillingDetails | null; readOnly: boolean }) {
  const qc = useQueryClient();
  const needsPayout = role === "distribution_partner";
  const copy = COPY[role];
  const [f, setF] = useState<Form>({
    is_business: billing?.is_business ?? role === "accommodation_partner",
    legal_name: billing?.legal_name ?? "",
    address_line1: billing?.address_line1 ?? "",
    address_line2: billing?.address_line2 ?? "",
    postal_code: billing?.postal_code ?? "",
    city: billing?.city ?? "",
    country: billing?.country ?? "NL",
    vat_number: billing?.vat_number ?? "",
    coc_number: billing?.coc_number ?? "",
    invoice_email: billing?.invoice_email ?? "",
    account_holder: billing?.account_holder ?? "",
    iban: billing?.iban ? formatIban(billing.iban) : "",
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const ibanInvalid = !!f.iban.trim() && normalizeIban(f.iban).length >= 15 && !isValidIban(f.iban);
  const complete = billingComplete(billing, needsPayout);

  const save = useMutation({
    mutationFn: async () => {
      const e = formError(f, needsPayout);
      if (e) throw new Error(e);
      const { error } = await supabase.rpc("save_my_billing_details", {
        _legal_name: f.legal_name.trim(),
        _is_business: f.is_business,
        _address_line1: f.address_line1.trim(),
        _address_line2: f.address_line2.trim() || null,
        _postal_code: f.postal_code.trim(),
        _city: f.city.trim(),
        _country: f.country,
        _vat_number: f.is_business && f.vat_number.trim() ? normalizeVat(f.vat_number) : null,
        _coc_number: f.is_business && f.coc_number.trim() ? f.coc_number.trim() : null,
        _invoice_email: f.invoice_email.trim() || null,
        _account_holder: f.account_holder.trim() || null,
        _iban: f.iban.trim() ? normalizeIban(f.iban) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${copy.title} saved`);
      qc.invalidateQueries({ queryKey: mySettingsKey(role) });
    },
    onError: (e) => toast.error(friendlyError(e, "Could not save these details. Please try again.")),
  });

  return (
    <SettingsSection id="billing" title={copy.title} description={copy.description}
      badge={<Badge tone={complete ? "moss" : "clay"}>{complete ? "Complete" : "Missing"}</Badge>}
      onSave={() => save.mutate()} saving={save.isPending} disabled={readOnly}>
      {!complete && !readOnly && <p className="rounded-xl bg-clay/10 px-4 py-3 text-sm text-clay">{copy.missing}</p>}

      <div role="radiogroup" aria-label="Invoiced as" className="flex flex-wrap gap-2">
        {[{ v: true, label: "Business" }, { v: false, label: "Individual" }].map((o) => (
          <button key={o.label} type="button" role="radio" aria-checked={f.is_business === o.v} onClick={() => set("is_business", o.v)}
            className={cn("rounded-full border px-4 py-1.5 text-sm transition",
              f.is_business === o.v ? "border-ink bg-ink text-paper" : "border-border bg-paper/60 text-foreground/70 hover:border-ink/30")}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label={f.is_business ? "Legal company name" : "Full name"}>
          <TextInput value={f.legal_name} maxLength={160} autoComplete={f.is_business ? "organization" : "name"} onChange={(e) => set("legal_name", e.target.value)} />
        </Field>
        <Field label={copy.emailLabel}>
          <TextInput type="email" inputMode="email" value={f.invoice_email} maxLength={200} autoComplete="email" onChange={(e) => set("invoice_email", e.target.value)} />
        </Field>
        <Field label="Address"><TextInput value={f.address_line1} maxLength={200} autoComplete="address-line1" onChange={(e) => set("address_line1", e.target.value)} /></Field>
        <Field label="Address line 2 (optional)"><TextInput value={f.address_line2} maxLength={200} autoComplete="address-line2" onChange={(e) => set("address_line2", e.target.value)} /></Field>
        <Field label="Postal code"><TextInput value={f.postal_code} maxLength={16} autoComplete="postal-code" onChange={(e) => set("postal_code", e.target.value)} /></Field>
        <Field label="City"><TextInput value={f.city} maxLength={120} autoComplete="address-level2" onChange={(e) => set("city", e.target.value)} /></Field>
        <Field label="Country"><NativeSelect value={f.country} options={billingCountryOptions()} autoComplete="country" onChange={(e) => set("country", e.target.value)} /></Field>
      </div>

      {f.is_business && (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="VAT number (optional)" hint="Include the country prefix, for example NL123456789B01.">
            <TextInput value={f.vat_number} maxLength={20} onChange={(e) => set("vat_number", e.target.value)} />
          </Field>
          <Field label="Chamber of Commerce number (optional)">
            <TextInput value={f.coc_number} maxLength={32} onChange={(e) => set("coc_number", e.target.value)} />
          </Field>
        </div>
      )}

      {needsPayout && (
        <div className="space-y-5 border-t pt-5">
          <h3 className="font-display text-lg">Bank account</h3>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Account holder">
              <TextInput value={f.account_holder} maxLength={160} onChange={(e) => set("account_holder", e.target.value)} />
            </Field>
            <Field label="IBAN" {...(ibanInvalid ? { hint: "This IBAN doesn't look right. Check it for typos." } : {})}>
              <TextInput value={f.iban} maxLength={42} autoComplete="off" spellCheck={false} placeholder="NL00 BANK 0000 0000 00"
                aria-invalid={ibanInvalid} className={cn("font-mono", ibanInvalid && "border-destructive")}
                onChange={(e) => set("iban", e.target.value.toUpperCase())} onBlur={() => f.iban.trim() && set("iban", formatIban(f.iban))} />
            </Field>
          </div>
          {billing?.payout_details_updated_at && (
            <p className="text-[12px] text-muted-foreground">
              Bank details last changed on {new Date(billing.payout_details_updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
