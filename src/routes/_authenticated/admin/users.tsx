import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge, DataTable, EmptyState, NativeSelect, PageHeader, Skeleton, TextInput } from "@/components/app/ui-kit";
import { ExcludeDemoToggle, REACH_LABEL, ROLE_TEXT, fmtDate } from "@/components/admin/shared";
import { distributionTypeLabel, marketLabel, nicheLabel } from "@/lib/constants";
import { formatIban } from "@/lib/billing";
import { isLocalDemo } from "@/integrations/demo-backend/mode";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Vellum admin" },
      { name: "description", content: "All users, their role and onboarding status." },
      { property: "og:title", content: "Users — Vellum admin" },
      { property: "og:description", content: "All users, their role and onboarding status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type UserRow = { id: string; email: string | null; first_name: string | null; last_name: string | null; display_name: string; company_name: string | null;
  country: string | null; role: string | null; onboarding_completed: boolean; terms_accepted_at: string | null; is_demo: boolean; created_at: string };

function Page() {
  const [exclude, setExclude] = useState(!isLocalDemo()); // browser demo: everything is demo data
  const [term, setTerm] = useState("");
  const [role, setRole] = useState("");
  const [open, setOpen] = useState<UserRow | null>(null);
  const q = useQuery({
    queryKey: ["admin-users", exclude],
    queryFn: async () => { const { data, error } = await supabase.rpc("admin_list_users", { _exclude_demo: exclude }); if (error) throw error; return data as UserRow[]; },
  });
  const rows = useMemo(() => (q.data ?? []).filter((u) =>
    (!role || (role === "none" ? !u.role : u.role === role)) &&
    (!term || [u.email, u.first_name, u.last_name, u.company_name].join(" ").toLowerCase().includes(term.toLowerCase()))), [q.data, role, term]);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Users" description="Everyone with an account, their role and onboarding status."
        actions={<ExcludeDemoToggle value={exclude} onChange={setExclude} />} />
      <div className="flex flex-wrap gap-3">
        <TextInput placeholder="Search name, email or company" value={term} onChange={(e) => setTerm(e.target.value)} className="max-w-xs" />
        <NativeSelect aria-label="Role" className="w-auto" value={role} onChange={(e) => setRole(e.target.value)}
          options={[{ value: "", label: "All roles" }, { value: "accommodation_partner", label: "Accommodation Partner" }, { value: "distribution_partner", label: "Distribution Partner" }, { value: "admin", label: "Admin" }, { value: "none", label: "No role yet" }]} />
      </div>
      {q.isLoading ? <Skeleton className="h-72" />
        : q.error ? <EmptyState icon={Users} title="Couldn't load users" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : !rows.length ? <EmptyState icon={Users} title="No users match" description="Try another search or role filter." action={<Button variant="outline" onClick={() => { setTerm(""); setRole(""); }}>Clear filters</Button>} />
        : (
          <DataTable columns={["User", "Role", "Onboarding", "Joined", ""]}
            rows={rows.map((u) => [
              <div key="u"><p className="font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.company_name || u.display_name || "—"}</p>
                <p className="text-[12px] text-muted-foreground">{u.email}{u.is_demo ? " · demo" : ""}</p></div>,
              <span key="r">{u.role ? ROLE_TEXT[u.role] : <span className="text-muted-foreground">No role yet</span>}</span>,
              <Badge key="o" tone={u.onboarding_completed ? "moss" : "clay"}>{u.onboarding_completed ? "Completed" : "Not completed"}</Badge>,
              <span key="j" className="text-muted-foreground">{fmtDate(u.created_at)}</span>,
              <Button key="v" size="sm" variant="outline" onClick={() => setOpen(u)}>View profile</Button>,
            ])} />
        )}
      <ProfileSheet user={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ProfileSheet({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin-user-profile", user?.id, user?.role],
    enabled: !!user && (user.role === "distribution_partner" || user.role === "accommodation_partner"),
    queryFn: async () => {
      if (user!.role === "distribution_partner") {
        const { data, error } = await supabase.rpc("get_partner_public_profile", { _partner_id: user!.id });
        if (error) throw error;
        return { kind: "dp" as const, dp: data[0] ?? null };
      }
      const { data, error } = await supabase.from("accommodation_partner_profiles").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      const { count } = await supabase.from("accommodations").select("id", { count: "exact", head: true }).eq("owner_id", user!.id);
      return { kind: "ap" as const, ap: data, stays: count ?? 0 };
    },
  });
  const billing = useQuery({
    queryKey: ["admin-user-billing", user?.id],
    enabled: !!user && (user.role === "distribution_partner" || user.role === "accommodation_partner"),
    queryFn: async () => {
      const { data, error } = await supabase.from("billing_details").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className="text-right">{v || "—"}</span></div>;
  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {user && <>
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">{[user.first_name, user.last_name].filter(Boolean).join(" ") || user.company_name || "User"}</SheetTitle>
            <SheetDescription>{user.email}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div>
              {row("Role", user.role ? ROLE_TEXT[user.role] : "No role yet")}
              {row("Company", user.company_name)}
              {row("Country", user.country && marketLabel(user.country))}
              {row("Onboarding", user.onboarding_completed ? "Completed" : "Not completed")}
              {row("Terms accepted", fmtDate(user.terms_accepted_at))}
              {row("Joined", fmtDate(user.created_at))}
              {row("Demo account", user.is_demo ? "Yes" : "No")}
            </div>
            {q.isLoading && <Skeleton className="h-40" />}
            {q.error && <p className="text-sm text-muted-foreground">We couldn't load the partner profile. Close and try again.</p>}
            {q.data?.kind === "dp" && (q.data.dp ? (
              <div>
                <p className="eyebrow mb-2">Distribution profile</p>
                {row("Brand", q.data.dp.brand_name)}
                {row("Type", distributionTypeLabel(q.data.dp.distribution_type))}
                {row("Website", <a className="underline" href={q.data.dp.website} target="_blank" rel="noreferrer">{q.data.dp.website}</a>)}
                {row("Reach", REACH_LABEL[q.data.dp.reach_band])}
                {row("Markets", q.data.dp.markets.join(", "))}
                {row("Niches", q.data.dp.niches.map(nicheLabel).join(", "))}
                {q.data.dp.bio && <p className="mt-3 text-sm text-ink/80">{q.data.dp.bio}</p>}
              </div>
            ) : <p className="text-sm text-muted-foreground">No distribution profile yet.</p>)}
            {q.data?.kind === "ap" && (q.data.ap ? (
              <div>
                <p className="eyebrow mb-2">Accommodation profile</p>
                {row("Business type", q.data.ap.business_type.replace(/_/g, " "))}
                {row("Website", q.data.ap.website)}
                {row("Accommodations (stated)", q.data.ap.accommodation_count_band.replace("_plus", "+").replace("_", "–"))}
                {row("Stays on Vellum", q.data.stays)}
                {row("Goals", q.data.ap.goals.map((g) => g.replace(/_/g, " ")).join(", "))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No accommodation profile yet.</p>)}
            {billing.error && <p className="text-sm text-muted-foreground">We couldn't load the billing details. Close and try again.</p>}
            {billing.isSuccess && (user.role === "distribution_partner" || user.role === "accommodation_partner") && (billing.data ? (
              <div>
                <p className="eyebrow mb-2">{user.role === "distribution_partner" ? "Payout details" : "Invoicing details"}</p>
                {row(billing.data.is_business ? "Legal name" : "Full name", billing.data.legal_name)}
                {row("Address", [billing.data.address_line1, billing.data.address_line2, `${billing.data.postal_code} ${billing.data.city}`, billing.data.country].filter(Boolean).join(", "))}
                {billing.data.is_business && row("VAT number", billing.data.vat_number)}
                {billing.data.is_business && row("Chamber of Commerce", billing.data.coc_number)}
                {row("Billing email", billing.data.invoice_email ?? `${user.email ?? "—"} (login email)`)}
                {user.role === "distribution_partner" && row("Account holder", billing.data.account_holder)}
                {user.role === "distribution_partner" && row("IBAN", billing.data.iban && <span className="font-mono">{formatIban(billing.data.iban)}</span>)}
                {billing.data.payout_details_updated_at && row("Bank details changed", fmtDate(billing.data.payout_details_updated_at))}
              </div>
            ) : <p className="text-sm text-clay">{user.role === "distribution_partner" ? "No payout details yet. Commission can't be paid out." : "No invoicing details yet."}</p>)}
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}
