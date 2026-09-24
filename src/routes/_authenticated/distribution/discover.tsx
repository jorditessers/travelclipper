import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState } from "react";
import { Compass, SlidersHorizontal, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Card, ChipMultiSelect, EmptyState, Field, NativeSelect, PageHeader, Skeleton, TextInput } from "@/components/app/ui-kit";
import { usePlatformSettings } from "@/components/accommodations/CommissionSettings";
import { STAY_SELECT, StayCard, countryName, toStayCards } from "@/components/distribution/stays";
import {
  ACCOMMODATION_TYPES, NICHES, accommodationTypeLabel, nicheLabel, type Niche, type AccommodationType,
} from "@/lib/constants";

const PAGE = 24;

const schema = z.object({
  q: fallback(z.string(), "").default(""),
  country: fallback(z.string(), "").default(""),
  region: fallback(z.string(), "").default(""),
  type: fallback(z.string(), "").default(""),
  guests: fallback(z.number(), 0).default(0),
  pmin: fallback(z.number(), 0).default(0),
  pmax: fallback(z.number(), 0).default(0),
  earn: fallback(z.number(), 0).default(0),
  niches: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "recommended").default("recommended"),
  pages: fallback(z.number(), 1).default(1),
});
type Search = z.infer<typeof schema>;
const DEFAULTS = schema.parse({});

export const Route = createFileRoute("/_authenticated/distribution/discover")({
  validateSearch: zodValidator(schema),
  head: () => ({
    meta: [
      { title: "Discover stays — Vellum" },
      { name: "description", content: "Find commissionable stays that fit your audience." },
      { property: "og:title", content: "Discover stays — Vellum" },
      { property: "og:description", content: "Find commissionable stays that fit your audience." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/distribution/discover" });
  const set = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, pages: 1, ...patch }), replace: true });
  const platform = usePlatformSettings();
  const share = platform.data?.partnerShare ?? 0.7;
  const pages = Math.max(1, Math.min(20, s.pages));
  const nicheList = s.niches.split(",").filter((n) => NICHES.some((x) => x.value === n)) as Niche[];

  const facets = useQuery({
    queryKey: ["discover-facets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accommodations").select("country, region").eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const q = useQuery({
    queryKey: ["discover", s, pages, share],
    enabled: platform.isSuccess,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("accommodations")
        .select(STAY_SELECT, { count: "exact" })
        .eq("status", "active")
        .eq("accommodation_distribution_settings.distribution_enabled", true)
        .not("accommodation_distribution_settings.commission_pool_pct", "is", null);
      const term = s.q.trim().replace(/[,()%*]/g, " ").slice(0, 100);
      if (term) query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%,region.ilike.%${term}%`);
      if (s.country) query = query.eq("country", s.country);
      if (s.region) query = query.eq("region", s.region);
      if (s.type && ACCOMMODATION_TYPES.some((t) => t.value === s.type)) query = query.eq("accommodation_type", s.type as AccommodationType);
      if (s.guests > 0) query = query.gte("max_guests", s.guests);
      if (s.pmin > 0) query = query.gte("starting_price_per_night", s.pmin);
      if (s.pmax > 0) query = query.lte("starting_price_per_night", s.pmax);
      // effective_pool_pct = effective_commission_pct(id, today): campaign pool if one is live, else standard pool
      if (s.earn > 0) query = query.gte("effective_pool_pct" as any, s.earn / share);
      if (nicheList.length) query = query.overlaps("niches", nicheList);
      // recommendation_score = score_accommodation_for_partner(id, auth.uid()) — same scoring as the dashboard
      if (s.sort === "recommended") query = query.order("recommendation_score" as any, { ascending: false });
      if (s.sort === "earnings") query = query.order("effective_pool_pct" as any, { ascending: false });
      query = query.order("created_at", { ascending: false }).range(0, pages * PAGE - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      const rows = await toStayCards(data, share);
      return { rows, count: count ?? rows.length };
    },
  });

  const chips: { label: string; clear: Partial<Search> }[] = [
    s.q && { label: `"${s.q}"`, clear: { q: "" } },
    s.country && { label: countryName(s.country), clear: { country: "" } },
    s.region && { label: s.region, clear: { region: "" } },
    s.type && { label: accommodationTypeLabel(s.type as AccommodationType), clear: { type: "" } },
    s.guests > 0 && { label: `${s.guests}+ guests`, clear: { guests: 0 } },
    s.pmin > 0 && { label: `From €${s.pmin}`, clear: { pmin: 0 } },
    s.pmax > 0 && { label: `Up to €${s.pmax}`, clear: { pmax: 0 } },
    s.earn > 0 && { label: `Earn ${s.earn}%+`, clear: { earn: 0 } },
    ...nicheList.map((n) => ({ label: nicheLabel(n), clear: { niches: nicheList.filter((x) => x !== n).join(",") } })),
  ].filter(Boolean) as { label: string; clear: Partial<Search> }[];
  const clearAll = () => navigate({ search: { ...DEFAULTS, sort: s.sort }, replace: true });

  const filters = <Filters s={s} set={set} nicheList={nicheList} facets={facets.data ?? []} />;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Distribution" title="Discover stays" description="Commissionable stays you can promote under your own brand. You earn on every confirmed booking you generate." />
      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">{filters}</aside>
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden"><SlidersHorizontal className="size-4" /> Filters{chips.length ? ` (${chips.length})` : ""}</Button>
              </SheetTrigger>
              <SheetContent side="left" className="overflow-y-auto">
                <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
                <div className="px-4 pb-6">{filters}</div>
              </SheetContent>
            </Sheet>
            <p className="text-sm text-muted-foreground">{q.data ? `${q.data.count} stays` : ""}</p>
            <NativeSelect aria-label="Sort" className="w-auto" value={s.sort} onChange={(e) => set({ sort: e.target.value })}
              options={[{ value: "recommended", label: "Recommended" }, { value: "earnings", label: "Highest earnings" }, { value: "recent", label: "Recently added" }]} />
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button key={c.label} onClick={() => set(c.clear)} className="inline-flex items-center gap-1 rounded-full border border-ink/20 bg-paper px-3 py-1 text-[12px] hover:border-ink/50">
                  {c.label} <X className="size-3" />
                </button>
              ))}
              <button onClick={clearAll} className="text-[12px] text-ink/60 underline-offset-2 hover:underline">Clear all</button>
            </div>
          )}

          {(q.isLoading || platform.isLoading) && (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-96" />)}</div>
          )}
          {(q.error || platform.error) && (
            <EmptyState icon={Compass} title="Couldn't load stays" description="We couldn't load this right now. Check your connection and try again."
              action={<Button variant="outline" onClick={() => { platform.refetch(); q.refetch(); }}>Retry</Button>} />
          )}
          {q.data && q.data.rows.length === 0 && (
            <EmptyState icon={Compass} title="No stays match these filters."
              action={chips.length ? <Button variant="outline" onClick={clearAll}>Clear filters</Button> : undefined} />
          )}
          {q.data && q.data.rows.length > 0 && (
            <>
              <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {q.data.rows.map((a) => <li key={a.id}><StayCard a={a} /></li>)}
              </ul>
              {q.data.rows.length < q.data.count && (
                <div className="flex justify-center">
                  <Button variant="outline" disabled={q.isFetching} onClick={() => navigate({ search: (p) => ({ ...p, pages: pages + 1 }), replace: true, resetScroll: false })}>
                    {q.isFetching ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Filters({ s, set, nicheList, facets }: {
  s: Search; set: (p: Partial<Search>) => void; nicheList: Niche[]; facets: { country: string | null; region: string | null }[];
}) {
  const [q, setQ] = useState(s.q);
  useEffect(() => setQ(s.q), [s.q]);
  useEffect(() => {
    const t = setTimeout(() => { if (q !== s.q) set({ q }); }, 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const countries = [...new Set(facets.map((f) => f.country).filter(Boolean) as string[])].sort();
  const regions = [...new Set(facets.filter((f) => !s.country || f.country === s.country).map((f) => f.region).filter(Boolean) as string[])].sort();
  const num = (v: string) => Math.max(0, Number(v) || 0);
  return (
    <div className="space-y-5">
      <Field label="Search"><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, city or region" /></Field>
      <Field label="Country">
        <NativeSelect value={s.country} onChange={(e) => set({ country: e.target.value, region: "" })}
          options={[{ value: "", label: "Any country" }, ...countries.map((c) => ({ value: c, label: countryName(c) }))]} />
      </Field>
      <Field label="Region">
        <NativeSelect value={s.region} onChange={(e) => set({ region: e.target.value })}
          options={[{ value: "", label: "Any region" }, ...regions.map((r) => ({ value: r, label: r }))]} />
      </Field>
      <Field label="Accommodation type">
        <NativeSelect value={s.type} onChange={(e) => set({ type: e.target.value })}
          options={[{ value: "", label: "Any type" }, ...ACCOMMODATION_TYPES]} />
      </Field>
      <Field label="Min. guests"><TextInput type="number" min={0} value={s.guests || ""} onChange={(e) => set({ guests: num(e.target.value) })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price from €"><TextInput type="number" min={0} value={s.pmin || ""} onChange={(e) => set({ pmin: num(e.target.value) })} /></Field>
        <Field label="to €"><TextInput type="number" min={0} value={s.pmax || ""} onChange={(e) => set({ pmax: num(e.target.value) })} /></Field>
      </div>
      <Field label="Min. you earn (%)"><TextInput type="number" min={0} step={0.5} value={s.earn || ""} onChange={(e) => set({ earn: num(e.target.value) })} /></Field>
      <div>
        <p className="mb-2 text-[13px] font-medium">Niches</p>
        <ChipMultiSelect options={NICHES} value={nicheList} onChange={(v) => set({ niches: v.join(",") })} />
      </div>
    </div>
  );
}
