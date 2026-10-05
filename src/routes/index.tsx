import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site/SiteHeader";
import { GlassCard, Eyebrow, EarnBadge } from "@/components/site/Primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import heroVilla from "@/assets/hero-villa.jpg";
import stayCasaLumen from "@/assets/stay-casa-lumen.jpg";
import stayLoftFig from "@/assets/stay-loft-fig.jpg";
import stayVillaMares from "@/assets/stay-villa-mares.jpg";

const TITLE = "Holiday Clippers — Open distribution for independent travel";
const DESCRIPTION =
  "Accommodation partners publish commissionable inventory. Creators, advisors and curators sell it under their own brand and earn on every attributed booking.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Index,
});

const FILTERS = [
  { value: "all", label: "All" },
  { value: "wellness", label: "Wellness" },
  { value: "design", label: "Design" },
  { value: "food", label: "Food & wine" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

type Stay = {
  name: string; meta: string; copy: string; details: string; pool: number; img: string; tags: Filter[];
};

// Example stays on the public homepage. Partners share 70% of the commission pool; the platform keeps 30%.
const STAYS: Stay[] = [
  {
    name: "Casa Lumen",
    meta: "Alentejo · Wellness · Sustainable",
    copy: "Adults-only stone retreat with thermal pools and a farm-to-table kitchen.",
    details: "Eight suites in a restored farmhouse among cork oaks. Guests start the day in the thermal pools and end it at a long table with produce from the estate's own garden and local Alentejo wines.",
    pool: 12,
    img: stayCasaLumen,
    tags: ["wellness", "food"],
  },
  {
    name: "The Loft & Fig",
    meta: "Lisbon · Design · City",
    copy: "Twelve architect-designed suites above a neighbourhood bakery and wine bar.",
    details: "Light-filled suites with local ceramics and handmade furniture in a quiet Lisbon street. Breakfast comes from the bakery downstairs; in the evening the wine bar pours natural wines from small Portuguese producers.",
    pool: 8,
    img: stayLoftFig,
    tags: ["design", "food"],
  },
  {
    name: "Villa Marés",
    meta: "Costa Brava · Boutique · Couples",
    copy: "Whitewashed villa with a sea-facing plunge pool and private chef on request.",
    details: "A clean-lined villa above a small cove, made for couples. The plunge pool faces the sea, the spa treatments happen on the terrace and a private chef can cook Catalan dishes on request.",
    pool: 10,
    img: stayVillaMares,
    tags: ["design", "wellness"],
  },
];

const round1 = (n: number) => Math.round(n * 10) / 10;
const shareOf = (pool: number) => round1(pool * 0.7);

function Index() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Stay | null>(null);
  const shown = STAYS.filter((s) => filter === "all" || s.tags.includes(filter));
  const villaMares = STAYS.find((s) => s.name === "Villa Marés")!;
  return (
    <div className="min-h-screen bg-cream text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6">
        <section className="relative py-14 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="fade-up">
              <Eyebrow>Open B2B distribution infrastructure</Eyebrow>
              <h1 className="mt-5 font-display text-[42px] font-normal leading-[1.03] tracking-tight md:text-[64px]">
                Independent travel, <span className="italic text-moss">distributed</span> through
                the people your travelers already trust.
              </h1>
              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink/65">
                Accommodation partners publish commissionable inventory and content. Creators,
                advisors and curators sell it under their own brand — and earn on every booking we
                can prove they generated.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/auth" search={{ role: "distribution_partner" }}>
                    Browse commissionable inventory
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth" search={{ role: "accommodation_partner" }}>
                    I'm an accommodation partner
                  </Link>
                </Button>
              </div>
            </div>

            <div className="relative fade-up">
              <div className="absolute -right-6 -top-8 size-40 rounded-full bg-sage/25 blur-3xl" />
              <div className="absolute -bottom-6 -left-4 size-32 rounded-full bg-clay/20 blur-3xl" />
              <GlassCard size="lg" className="relative p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Eyebrow className="text-[10px] text-ink/45">Featured stay</Eyebrow>
                    <h3 className="mt-1 font-display text-2xl">Villa Marés</h3>
                    <p className="text-[13px] text-ink/55">Costa Brava · Boutique · Couples</p>
                  </div>
                  <EarnBadge pct={7} className="px-3 py-1" />
                </div>
                <button type="button" onClick={() => setOpen(villaMares)} className="mt-5 block w-full" aria-label="View Villa Marés">
                  <img
                    src={heroVilla}
                    alt="Golden-hour terrace of a whitewashed villa overlooking the Mediterranean"
                    width={1200}
                    height={800}
                    className="aspect-[3/2] w-full rounded-2xl object-cover"
                  />
                </button>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  {[
                    ["10%", "Pool"],
                    ["7%", "Your share"],
                    ["3%", "Platform"],
                  ].map(([v, l]) => (
                    <div key={l} className="rounded-xl border border-paper/60 bg-paper/40 px-2 py-3">
                      <p className="font-display text-xl">{v}</p>
                      <p className="text-[10px] uppercase tracking-wider text-ink/45">{l}</p>
                    </div>
                  ))}
                </div>
                <Button asChild className="mt-5 w-full" size="sm">
                  <Link to="/auth" search={{ role: "distribution_partner" }}>Create tracking link</Link>
                </Button>
              </GlassCard>
            </div>
          </div>
        </section>

        <section className="border-y border-ink/10 py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[12px] text-ink/45">
            <span className="eyebrow text-ink/45">Distribution partners</span>
            <span>Creators</span>
            <span>Travel advisors</span>
            <span>Boutique agencies</span>
            <span>Curators</span>
            <span>Publishers</span>
            <span>Niche communities</span>
          </div>
        </section>

        <section className="py-14 md:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Commissionable inventory</Eyebrow>
              <h2 className="mt-2 font-display text-3xl md:text-4xl">
                Stays your audience will actually book
              </h2>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter stays">
              {FILTERS.map((f) => (
                <Button key={f.value} size="sm" variant={filter === f.value ? "default" : "outline"}
                  aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {shown.map((s) => (
              <GlassCard key={s.name} className="p-3 transition hover:-translate-y-0.5">
                <button type="button" onClick={() => setOpen(s)} className="block w-full text-left" aria-label={`View ${s.name}`}>
                <img
                  src={s.img}
                  alt={s.name}
                  loading="lazy"
                  width={800}
                  height={1000}
                  className="aspect-[4/5] w-full rounded-[16px] object-cover"
                />
                <div className="px-2 py-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl">{s.name}</h3>
                    <EarnBadge pct={shareOf(s.pool)} />
                  </div>
                  <p className="mt-1 text-[13px] text-ink/55">{s.meta}</p>
                  <p className="mt-3 text-[13px] leading-relaxed text-ink/65">{s.copy}</p>
                  <p className="mt-4 text-[13px] font-medium text-moss">View stay →</p>
                </div>
                </button>
              </GlassCard>
            ))}
          </div>
        </section>

        <section className="pb-20">
          <GlassCard size="lg" className="overflow-hidden">
            <div className="border-b border-paper/60 px-6 py-5">
              <h2 className="font-display text-2xl">Your earnings, attributed to the booking</h2>
              <p className="mt-1 text-[13px] text-ink/55">
                Commission is calculated in the database and snapshotted per booking — later changes
                never alter a closed deal.
              </p>
            </div>
            <div className="divide-y divide-paper/60">
              {[
                ["LM", "Villa Marés · 4 nights", "Costa Brava · Booked 12 Jun", "+€294", "7% · confirmed", "moss"],
                ["CL", "Casa Lumen · 3 nights", "Alentejo · Booked 04 Jun", "+€216", "8.4% · confirmed", "moss"],
                ["LF", "The Loft & Fig · 2 nights", "Lisbon · Booked 28 May", "€0", "pending · check-in", "clay"],
              ].map(([ini, title, sub, amt, note, tone]) => (
                <div key={title} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className="grid size-11 place-items-center rounded-full bg-mist text-[12px] font-medium">
                      {ini}
                    </div>
                    <div>
                      <p className="text-[14px] font-medium">{title}</p>
                      <p className="text-[12px] text-ink/50">{sub}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-display text-lg ${tone === "moss" ? "text-moss" : "text-clay"}`}>{amt}</p>
                    <p className="text-[11px] uppercase tracking-wider text-ink/45">{note}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 bg-moss/5 px-6 py-5">
              <div>
                <p className="text-[12px] uppercase tracking-wider text-ink/45">
                  This month · attributable earnings
                </p>
                <p className="font-display text-3xl">€510</p>
              </div>
              <span className="text-[11px] uppercase tracking-wider text-ink/40">Illustration</span>
            </div>
          </GlassCard>
        </section>
      </main>
      <SiteFooter />
      <StayDialog stay={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function StayDialog({ stay, onClose }: { stay: Stay | null; onClose: () => void }) {
  return (
    <Dialog open={!!stay} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-cream p-0 sm:max-w-lg">
        {stay && (
          <>
            <img src={stay.img} alt={stay.name} className="aspect-[3/2] w-full object-cover sm:rounded-t-lg" />
            <div className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <DialogTitle className="font-display text-3xl font-normal">{stay.name}</DialogTitle>
                  <p className="mt-1 text-[13px] text-ink/55">{stay.meta}</p>
                </div>
                <EarnBadge pct={shareOf(stay.pool)} className="mt-2 px-3 py-1" />
              </div>
              <DialogDescription className="text-[14px] leading-relaxed text-ink/70">{stay.details}</DialogDescription>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  [`${stay.pool}%`, "Commission pool"],
                  [`${shareOf(stay.pool)}%`, "Your share"],
                  [`${round1(stay.pool - shareOf(stay.pool))}%`, "Platform"],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-xl border border-ink/10 bg-paper/50 px-2 py-3">
                    <p className="font-display text-xl">{v}</p>
                    <p className="text-[10px] uppercase tracking-wider text-ink/45">{l}</p>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-ink/50">
                Example stay. Create a free distribution partner account to see all live stays and get your own tracking link.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild className="flex-1">
                  <Link to="/auth" search={{ role: "distribution_partner" }}>Create tracking link</Link>
                </Button>
                <Button asChild variant="outline" className="flex-1">
                  <Link to="/auth" search={{ role: "accommodation_partner" }}>List your own stay</Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
