import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, DataTable, EmptyState, Field, NativeSelect, PageHeader, Skeleton, TextInput } from "@/components/app/ui-kit";
import { ExcludeDemoToggle } from "@/components/admin/shared";
import { analyzeKpiDeviation, KPI_OPTIONS, type InsightResult } from "@/lib/insights.functions";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/admin/insights")({
  head: () => ({
    meta: [
      { title: "KPI insights — Vellum admin" },
      { name: "description", content: "AI summary of possible causes and next steps for a KPI deviation." },
      { property: "og:title", content: "KPI insights — Vellum admin" },
      { property: "og:description", content: "AI summary of possible causes and next steps for a KPI deviation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const LABELS: Record<string, string> = Object.fromEntries(KPI_OPTIONS.map((k) => [k.value, k.label]));
const SHOWN = ["new_users", "new_accommodations", "accommodations_published", "links_created", "unique_clicks", "saves", "content_downloads", "bookings_created", "bookings_confirmed", "booking_volume", "commission_total", "platform_revenue"];

function Page() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [kpi, setKpi] = useState<string>("bookings_confirmed");
  const [deviation, setDeviation] = useState<"drop" | "increase" | "unexpected">("drop");
  const [notes, setNotes] = useState("");
  const [exclude, setExclude] = useState(true);
  const analyze = useServerFn(analyzeKpiDeviation);
  const m = useMutation({
    mutationFn: async (): Promise<Extract<InsightResult, { ok: true }>> => {
      const r = await analyze({ data: { from, to, kpi, deviation, context: notes, excludeDemo: exclude } });
      if (!r.ok) throw new Error(r.error);
      return r;
    },
    onSuccess: () => toast.success("Analysis ready"),
    onError: (e) => toast.error(friendlyError(e, "The AI analysis failed. Please try again.")),
  });
  const valid = from && to && from <= to;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="KPI insights" description="Pick a period and a KPI that moved unexpectedly. Lovable AI compares it with the previous period and suggests possible causes and next steps."
        actions={<ExcludeDemoToggle value={exclude} onChange={setExclude} />} />
      <Card className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="From"><TextInput type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="KPI"><NativeSelect value={kpi} onChange={(e) => setKpi(e.target.value)} options={KPI_OPTIONS.map((k) => ({ value: k.value, label: k.label }))} /></Field>
        <Field label="Deviation"><NativeSelect value={deviation} onChange={(e) => setDeviation(e.target.value as typeof deviation)}
          options={[{ value: "drop", label: "Unexpected drop" }, { value: "increase", label: "Unexpected increase" }, { value: "unexpected", label: "Other change" }]} /></Field>
        <div className="md:col-span-2 lg:col-span-4">
          <Field label="What did you notice? (optional)" hint="Adds context for the analysis, e.g. a partner campaign or a paused stay.">
            <Textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <div className="md:col-span-2 lg:col-span-4">
          <Button disabled={!valid || m.isPending} onClick={() => m.mutate()}><Sparkles className="size-4" /> {m.isPending ? "Analysing… this can take a minute" : "Analyse"}</Button>
        </div>
      </Card>

      {m.isPending ? <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
        : m.error ? <EmptyState icon={Sparkles} title="The analysis didn't complete" description={m.error.message} action={<Button variant="outline" onClick={() => m.mutate()}>Try again</Button>} />
        : m.data ? (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <p className="eyebrow mb-3">AI summary · {LABELS[kpi]}</p>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{m.data.summary}</div>
              <p className="mt-4 text-[12px] text-muted-foreground">Generated by Lovable AI from platform numbers only. Treat causes as hypotheses and verify them.</p>
            </Card>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{m.data.metrics.current_period.from} – {m.data.metrics.current_period.to} vs. {m.data.metrics.previous_period.from} – {m.data.metrics.previous_period.to}</p>
              <DataTable columns={["Metric", "Now", "Before"]}
                rows={SHOWN.map((k) => [
                  <span key="k" className={k === kpi ? "font-medium" : ""}>{LABELS[k] ?? k.replace(/_/g, " ")}</span>,
                  <span key="c" className="tabular-nums">{String(m.data.metrics.current[k] ?? "—")}</span>,
                  <span key="p" className="tabular-nums text-muted-foreground">{String(m.data.metrics.previous[k] ?? "—")}</span>,
                ])} />
            </div>
          </div>
        ) : <EmptyState icon={Sparkles} title="No analysis yet" description="Choose a period, a KPI and the kind of deviation, then run the analysis." />}
    </div>
  );
}
