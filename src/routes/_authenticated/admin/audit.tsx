import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, NativeSelect, PageHeader, Skeleton, TextInput } from "@/components/app/ui-kit";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Vellum admin" },
      { name: "description", content: "Every admin change to bookings, statuses and settings." },
      { property: "og:title", content: "Audit log — Vellum admin" },
      { property: "og:description", content: "Every admin change to bookings, statuses and settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const ACTION_LABEL: Record<string, string> = {
  "accommodation.approve": "Approved stay", "accommodation.reject": "Rejected stay", "accommodation.status": "Changed stay status",
  "booking.correct": "Corrected booking", "platform.partner_share": "Changed partner share",
};
const fmt = (v: unknown) => v == null ? "—" : Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k.replace(/_/g, " ")}: ${x ?? "—"}`).join(" · ");

function Page() {
  const [admin, setAdmin] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [term, setTerm] = useState("");

  const q = useQuery({
    queryKey: ["admin-audit", from, to],
    queryFn: async () => {
      let query = supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(1000);
      if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
      if (to) query = query.lt("created_at", new Date(new Date(`${to}T00:00:00Z`).getTime() + 86400000).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      const ids = [...new Set(data.map((r) => r.admin_id))];
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id, email, first_name, last_name").in("id", ids) : { data: [] };
      const name = new Map((profs ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Admin"]));
      return data.map((r) => ({ ...r, adminName: name.get(r.admin_id) ?? "Admin" }));
    },
  });
  const all = q.data ?? [];
  const admins = useMemo(() => [...new Map(all.map((r) => [r.admin_id, r.adminName])).entries()], [all]);
  const actions = useMemo(() => [...new Set(all.map((r) => r.action))].sort(), [all]);
  const entities = useMemo(() => [...new Set(all.map((r) => r.entity))].sort(), [all]);
  const rows = all.filter((r) => (!admin || r.admin_id === admin) && (!action || r.action === action) && (!entity || r.entity === entity)
    && (!term || `${r.note ?? ""} ${r.entity_id ?? ""} ${JSON.stringify(r.old_value)} ${JSON.stringify(r.new_value)}`.toLowerCase().includes(term.toLowerCase())));
  const clear = () => { setAdmin(""); setAction(""); setEntity(""); setFrom(""); setTo(""); setTerm(""); };

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Audit log" description="Every admin change to bookings, stay statuses and platform settings, newest first." />
      <div className="flex flex-wrap items-end gap-3">
        <TextInput placeholder="Search note, ID or values" value={term} onChange={(e) => setTerm(e.target.value)} className="max-w-xs" />
        <NativeSelect aria-label="Admin" className="w-auto" value={admin} onChange={(e) => setAdmin(e.target.value)} options={[{ value: "", label: "All admins" }, ...admins.map(([v, l]) => ({ value: v, label: l }))]} />
        <NativeSelect aria-label="Action" className="w-auto" value={action} onChange={(e) => setAction(e.target.value)} options={[{ value: "", label: "All actions" }, ...actions.map((a) => ({ value: a, label: ACTION_LABEL[a] ?? a }))]} />
        <NativeSelect aria-label="Entity" className="w-auto" value={entity} onChange={(e) => setEntity(e.target.value)} options={[{ value: "", label: "All entities" }, ...entities.map((e) => ({ value: e, label: e.replace(/_/g, " ") }))]} />
        <label className="text-sm text-muted-foreground">From <TextInput type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-auto" /></label>
        <label className="text-sm text-muted-foreground">To <TextInput type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-auto" /></label>
      </div>
      {q.isLoading ? <Skeleton className="h-72" />
        : q.error ? <EmptyState icon={History} title="Couldn't load the audit log" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : !all.length && !from && !to ? <EmptyState icon={History} title="No admin changes yet" description="Status changes, booking corrections and setting changes will be listed here." />
        : !rows.length ? <EmptyState icon={History} title="No entries match" description="Try other filters or a wider period." action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
        : (
          <DataTable columns={["When", "Admin", "Action", "Change", "Note"]}
            rows={rows.map((r) => [
              <span key="w" className="whitespace-nowrap text-sm">{new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>,
              <span key="a">{r.adminName}</span>,
              <div key="ac"><p>{ACTION_LABEL[r.action] ?? r.action}</p><p className="font-mono text-[11px] text-muted-foreground">{r.entity}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}</p></div>,
              <div key="c" className="max-w-md text-[12px]"><p className="text-muted-foreground">From {fmt(r.old_value)}</p><p>To {fmt(r.new_value)}</p></div>,
              <span key="n" className="text-sm">{r.note ?? "—"}</span>,
            ])} />
        )}
      {all.length >= 1000 && <p className="text-[12px] text-muted-foreground">Showing the latest 1,000 entries. Narrow the period to see older ones.</p>}
    </div>
  );
}
