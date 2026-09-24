import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge, DataTable, EmptyState, Field, NativeSelect, PageHeader, Skeleton, TextInput } from "@/components/app/ui-kit";
import { ExcludeDemoToggle, NoteDialog, fmtDate } from "@/components/admin/shared";
import { ACCOMMODATION_STATUS_LABEL, accommodationTypeLabel, type AccommodationStatus } from "@/lib/constants";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/accommodations")({
  head: () => ({
    meta: [
      { title: "Accommodations — Vellum admin" },
      { name: "description", content: "All stays on the platform and their status." },
      { property: "og:title", content: "Accommodations — Vellum admin" },
      { property: "og:description", content: "All stays on the platform and their status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const STATUSES: AccommodationStatus[] = ["draft", "pending_review", "active", "paused"];
const tone = (s: string) => (s === "active" ? "moss" : s === "pending_review" ? "clay" : "neutral") as "moss" | "clay" | "neutral";

function Page() {
  const qc = useQueryClient();
  const [exclude, setExclude] = useState(true);
  const [status, setStatus] = useState("");
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["admin-accommodations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accommodations")
        .select("id, name, city, country, accommodation_type, status, owner_id, is_demo, created_at, first_published_at, accommodation_distribution_settings(commission_pool_pct)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const owners = [...new Set(data.map((a) => a.owner_id))];
      const { data: profs } = owners.length ? await supabase.from("profiles").select("id, company_name, email").in("id", owners) : { data: [] };
      const byId = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((a) => ({ ...a, owner: byId.get(a.owner_id) }));
    },
  });
  const change = useMutation({
    mutationFn: async (v: { id: string; status: AccommodationStatus; note: string }) => {
      const { error } = await supabase.rpc("admin_set_accommodation_status", { _accommodation_id: v.id, _status: v.status, _note: v.note });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status updated and logged"); qc.invalidateQueries({ queryKey: ["admin-accommodations"] }); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const rows = useMemo(() => (q.data ?? []).filter((a) => (!exclude || !a.is_demo) && (!status || a.status === status)
    && (!term || `${a.name} ${a.city ?? ""} ${a.owner?.company_name ?? ""}`.toLowerCase().includes(term.toLowerCase()))), [q.data, exclude, status, term]);
  const pending = (q.data ?? []).filter((a) => a.status === "pending_review").length;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Accommodations" description="Every stay on the platform. Status changes need a note and are logged."
        actions={<div className="flex flex-wrap items-center gap-4">
          <ExcludeDemoToggle value={exclude} onChange={setExclude} />
          <Button asChild variant="outline"><Link to="/admin/review"><ClipboardCheck className="size-4" /> Review queue{pending ? ` (${pending})` : ""}</Link></Button>
        </div>} />
      <div className="flex flex-wrap gap-3">
        <TextInput placeholder="Search name, city or owner" value={term} onChange={(e) => setTerm(e.target.value)} className="max-w-xs" />
        <NativeSelect aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}
          options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: ACCOMMODATION_STATUS_LABEL[s] }))]} />
      </div>
      {q.isLoading ? <Skeleton className="h-72" />
        : q.error ? <EmptyState icon={Building2} title="Couldn't load accommodations" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : !rows.length ? <EmptyState icon={Building2} title="No accommodations match" description="Try another filter, or include demo data." action={<Button variant="outline" onClick={() => { setStatus(""); setTerm(""); }}>Clear filters</Button>} />
        : (
          <DataTable columns={["Stay", "Owner", "Pool", "Status", "Created", ""]}
            rows={rows.map((a) => [
              <div key="n"><p className="font-medium">{a.name}</p><p className="text-[12px] text-muted-foreground">{accommodationTypeLabel(a.accommodation_type)} · {[a.city, a.country].filter(Boolean).join(", ")}{a.is_demo ? " · demo" : ""}</p></div>,
              <span key="o" className="text-sm">{a.owner?.company_name ?? a.owner?.email ?? "—"}</span>,
              <span key="p" className="tabular-nums">{a.accommodation_distribution_settings?.commission_pool_pct != null ? `${Number(a.accommodation_distribution_settings.commission_pool_pct)}%` : "—"}</span>,
              <Badge key="s" tone={tone(a.status)}>{ACCOMMODATION_STATUS_LABEL[a.status]}</Badge>,
              <span key="c" className="text-muted-foreground">{fmtDate(a.created_at)}</span>,
              <StatusChanger key="x" current={a.status} name={a.name} pending={change.isPending}
                onSubmit={(s, note) => change.mutateAsync({ id: a.id, status: s, note })} />,
            ])} />
        )}
    </div>
  );
}

function StatusChanger({ current, name, onSubmit, pending }: { current: AccommodationStatus; name: string; pending: boolean; onSubmit: (s: AccommodationStatus, note: string) => Promise<unknown> }) {
  const options = STATUSES.filter((s) => s !== current);
  const [next, setNext] = useState<AccommodationStatus>(current === "active" ? "paused" : options[0]!);
  return (
    <NoteDialog title={`Change status of ${name}`} description={`Currently ${ACCOMMODATION_STATUS_LABEL[current]}. Pausing or moving to draft hides it from Distribution Partners.`}
      confirmLabel="Change status" pending={pending} onSubmit={(note) => onSubmit(next, note)}
      trigger={<Button size="sm" variant="outline">Change status</Button>}>
      <Field label="New status">
        <NativeSelect value={next} onChange={(e) => setNext(e.target.value as AccommodationStatus)}
          options={options.map((s) => ({ value: s, label: ACCOMMODATION_STATUS_LABEL[s] }))} />
      </Field>
    </NoteDialog>
  );
}
