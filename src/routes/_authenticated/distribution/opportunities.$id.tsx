import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Compass, Info, Users, BedDouble, Bath, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ReportBookingDialog } from "@/components/bookings/shared";
import { TrackingLinkDialog } from "@/components/distribution/TrackingLinkDialog";
import { Card, EmptyState, Field, Skeleton, TextInput } from "@/components/app/ui-kit";
import { usePlatformSettings } from "@/components/accommodations/CommissionSettings";
import { BoostBadge, SaveButton, countryName, earnPct, signedOrExternal } from "@/components/distribution/stays";
import { liveCampaign, shortDate } from "@/lib/campaigns";
import { OpportunityContent } from "@/components/distribution/OpportunityContent";
import { accommodationTypeLabel, nicheLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/distribution/opportunities/$id")({
  head: () => ({
    meta: [
      { title: "Distribution opportunity — Vellum" },
      { name: "description", content: "Commission, details and content terms for this stay." },
      { property: "og:title", content: "Distribution opportunity — Vellum" },
      { property: "og:description", content: "Commission, details and content terms for this stay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "details", label: "Stay details" },
  { key: "suited", label: "Best suited for" },
  { key: "content", label: "Content" },
  { key: "terms", label: "Content usage terms" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const eur = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function Page() {
  const { id } = Route.useParams();
  const platform = usePlatformSettings();
  const [tab, setTab] = useState<Tab>("overview");
  const [example, setExample] = useState("5000");
  const logged = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ["opportunity", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodations")
        .select("*, effective_pool_pct, accommodation_distribution_settings!inner(*), commission_campaigns(name, commission_pool_pct, starts_on, ends_on, description), accommodation_assets(id, asset_type, storage_path, external_url, is_cover, title, sort_order)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const photos = data.accommodation_assets
        .filter((x) => x.asset_type === "photo" || x.asset_type === "drone")
        .sort((x, y) => Number(y.is_cover) - Number(x.is_cover) || x.sort_order - y.sort_order)
        .slice(0, 5);
      const urls = await Promise.all(photos.map((p) => signedOrExternal(p)));
      return { ...data, gallery: photos.map((p, i) => ({ id: p.id, title: p.title, url: urls[i] })).filter((p) => p.url) };
    },
  });

  useEffect(() => {
    if (!q.data || logged.current === id) return;
    logged.current = id;
    supabase.rpc("log_event", { _event_type: "opportunity_viewed", _accommodation_id: id }).then(() => {});
  }, [q.data, id]);

  if (q.isLoading || platform.isLoading)
    return <div className="space-y-6"><Skeleton className="h-[420px]" /><Skeleton className="h-10 w-80" /><Skeleton className="h-64" /></div>;
  if (q.error || platform.error)
    return <EmptyState icon={Compass} title="Couldn't load this opportunity" description="We couldn't load this right now. Check your connection and try again."
      action={<Button variant="outline" onClick={() => { q.refetch(); platform.refetch(); }}>Retry</Button>} />;
  const a = q.data;
  if (!a) return <EmptyState icon={Compass} title="This stay is no longer available" description="It may have been paused or removed from distribution."
    action={<Button variant="outline" asChild><Link to="/distribution/discover">Back to Discover</Link></Button>} />;

  const s = a.accommodation_distribution_settings;
  const share = platform.data!.partnerShare;
  const eff = (a as unknown as { effective_pool_pct: number | null }).effective_pool_pct;
  const pct = earnPct(eff ?? s.commission_pool_pct ?? 0, share);
  const boost = liveCampaign(a.commission_campaigns);
  const standardPct = earnPct(s.commission_pool_pct ?? 0, share);
  const value = Math.max(0, Number(example) || 0);
  const [hero, ...rest] = a.gallery;

  return (
    <div className="space-y-8 pb-24 lg:pb-0">
      <Link to="/distribution/discover" className="text-sm text-ink/60 hover:text-ink">← Discover stays</Link>

      <section className="grid gap-2 overflow-hidden rounded-3xl md:h-[460px] md:grid-cols-4 md:grid-rows-2">
        <div className="relative aspect-[4/3] bg-mist md:col-span-2 md:row-span-2 md:aspect-auto">
          {hero && <img src={hero.url!} alt={a.name} className="size-full object-cover" />}
        </div>
        {rest.slice(0, 4).map((p) => (
          <div key={p.id} className="hidden bg-mist md:block"><img src={p.url!} alt={p.title || a.name} loading="lazy" className="size-full object-cover" /></div>
        ))}
      </section>

      <div>
        <p className="eyebrow">{accommodationTypeLabel(a.accommodation_type)}</p>
        <h1 className="mt-1 font-display text-4xl md:text-5xl">{a.name}</h1>
        <p className="mt-2 inline-flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-4" />
          {[a.city, a.region, a.country && countryName(a.country)].filter(Boolean).join(", ")}</p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <nav className="flex gap-6 overflow-x-auto border-b border-border" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn("-mb-px shrink-0 border-b-2 pb-3 text-sm transition", tab === t.key ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink")}>
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "overview" && (
            <div className="space-y-4">
              {a.short_description && <p className="font-display text-xl leading-snug">{a.short_description}</p>}
              {a.long_description && <p className="max-w-[68ch] whitespace-pre-line leading-relaxed text-ink/80">{a.long_description}</p>}
              <div className="flex flex-wrap gap-1.5 pt-2">
                {a.niches.map((n) => <span key={n} className="rounded-full bg-mist px-3 py-1 text-[12px]">{nicheLabel(n)}</span>)}
              </div>
            </div>
          )}
          {tab === "details" && (
            <Card className="grid gap-6 sm:grid-cols-2">
              <Detail icon={Users} k="Max guests" v={a.max_guests} />
              <Detail icon={BedDouble} k="Bedrooms" v={a.bedrooms} />
              <Detail icon={Bath} k="Bathrooms" v={a.bathrooms} />
              <Detail k="From" v={a.starting_price_per_night ? `${eur(Number(a.starting_price_per_night))} / night` : null} />
              <Detail k="Target markets" v={s.target_markets.map(countryName).join(", ")} />
              <Detail k="Website" v={a.website_url} />
            </Card>
          )}
          {tab === "suited" && (
            a.best_suited_for.length ? (
              <div className="flex flex-wrap gap-2">
                {a.best_suited_for.map((b) => <span key={b} className="rounded-full border border-ink/15 bg-paper px-4 py-1.5 text-sm">{b}</span>)}
              </div>
            ) : <p className="text-sm text-muted-foreground">The owner hasn't added audience labels yet.</p>
          )}
          {tab === "content" && <OpportunityContent accommodationId={a.id} name={a.name} terms={s.content_usage_terms} approvalRequired={s.content_approval_required} />}
          {tab === "terms" && (
            <div className="space-y-4">
              {s.content_approval_required && (
                <div className="flex gap-3 rounded-2xl border border-clay/30 bg-clay/5 p-4 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0 text-clay" />
                  <p>This accommodation asks you to check with them before publishing new content.</p>
                </div>
              )}
              <Card><p className="whitespace-pre-line text-sm">{s.content_usage_terms || "No specific usage terms. Use approved content respectfully and credit the accommodation."}</p></Card>
            </div>
          )}
        </div>

        <aside>
          <Card className="space-y-5 lg:sticky lg:top-24">
            <p className="font-display text-3xl text-moss">You earn {pct}%</p>
            <p className="-mt-3 text-sm text-muted-foreground">On every confirmed booking you generate.</p>
            {boost && (
              <div className="space-y-1.5 rounded-2xl border border-clay/25 bg-clay/5 p-4">
                <BoostBadge earn={pct} endsOn={boost.ends_on} />
                <p className="text-sm font-medium">{boost.name}</p>
                {boost.description && <p className="text-sm text-ink/75">{boost.description}</p>}
                <p className="text-[12px] text-muted-foreground">
                  Temporary campaign from {shortDate(boost.starts_on)} to {shortDate(boost.ends_on)}. Standard rate: you earn {standardPct}%.
                </p>
              </div>
            )}
            <Field label="Estimated booking (EUR)">
              <TextInput inputMode="decimal" value={example} onChange={(e) => setExample(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <p className="text-sm">{eur(value)} → <span className="font-medium">You earn {eur((value * pct) / 100)}</span></p>
            <div className="space-y-2 pt-1">
              <SaveButton id={a.id} withLabel />
              <TrackingLinkDialog accommodationId={a.id} />
              <Button variant="outline" className="w-full" onClick={() => setTab("content")}>View content</Button>
              <ReportBookingDialog accommodationId={a.id}
                trigger={<button type="button" className="w-full pt-1 text-center text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline">Report a booking</button>} />
            </div>
          </Card>
        </aside>
      </div>

      {/* Mobile/tablet quick actions: tracking link + report booking always one tap away */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-paper/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="min-w-0 flex-1"><TrackingLinkDialog accommodationId={a.id} /></div>
          <ReportBookingDialog accommodationId={a.id} trigger={<Button variant="outline" className="shrink-0">Report booking</Button>} />
        </div>
      </div>
    </div>
  );
}

function Detail({ k, v, icon: Icon }: { k: string; v: string | number | null | undefined; icon?: typeof Users }) {
  return (
    <div>
      <p className="eyebrow">{k}</p>
      <p className="mt-1 inline-flex items-center gap-1.5 break-all text-sm">{Icon && <Icon className="size-4 text-ink/50" />}{v || <span className="text-ink/40">—</span>}</p>
    </div>
  );
}
