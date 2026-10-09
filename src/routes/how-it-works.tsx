import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { Eyebrow, GlassCard } from "@/components/site/Primitives";
import { FaqList } from "@/components/site/FaqList";
import { Button } from "@/components/ui/button";
import { FAQ } from "@/lib/faq";

const TITLE = "How it works — Holiday Clippers";
const DESCRIPTION =
  "How Holiday Clippers connects independent stays with creators and travel advisors, what it costs and how commission works.";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.flatMap((g) => g.items).map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a.join(" ") },
          })),
        }),
      },
    ],
  }),
  component: Page,
});

const STEPS = {
  accommodations: {
    title: "For accommodations",
    cta: { label: "List your stay", role: "accommodation_partner" as const },
    steps: [
      ["List your stay", "Add photos, a description and your booking page. We review every stay personally, usually within 1–3 working days."],
      ["Set your commission", "You decide the commission pool. Most stays offer 8–12%, and you only pay on confirmed bookings."],
      ["Get bookings from partners", "Partners share your stay with their audience. Guests book directly with you, and you confirm every booking."],
    ],
  },
  partners: {
    title: "For creators and travel advisors",
    cta: { label: "Join as a partner", role: "distribution_partner" as const },
    steps: [
      ["Pick stays you love", "Browse independent stays and see exactly what you earn on each one."],
      ["Share your link", "Get a personal tracking link and code, and share it on Instagram, in your newsletter, blog or with your clients."],
      ["Earn on every booking", "You earn 70% of the commission on every confirmed booking. We pay out once a month."],
    ],
  },
};

function Page() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6">
        <section className="max-w-3xl py-14 md:py-20">
          <Eyebrow>How it works</Eyebrow>
          <h1 className="mt-5 font-display text-[40px] font-normal leading-[1.05] tracking-tight md:text-[56px]">
            Independent stays, shared by people travellers <span className="italic text-moss">trust</span>.
          </h1>
          <p className="mt-6 text-[16px] leading-relaxed text-ink/65">
            Holiday Clippers is a B2B platform that connects independent accommodations with creators, travel advisors and
            curators. Accommodations set a commission, partners share the stays with their audience, and everyone earns on
            bookings that actually happen. Guests always book directly with the accommodation.
          </p>
        </section>

        <section className="grid gap-6 pb-16 md:grid-cols-2">
          {(Object.entries(STEPS) as [keyof typeof STEPS, (typeof STEPS)[keyof typeof STEPS]][]).map(([id, s]) => (
            <GlassCard key={id} size="lg" className="flex flex-col p-7 md:p-8">
              <h2 id={id} className="scroll-mt-24 font-display text-2xl">{s.title}</h2>
              <ol className="mt-6 flex-1 space-y-5">
                {s.steps.map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-moss/10 font-display text-moss">{i + 1}</span>
                    <div>
                      <p className="font-medium">{t}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-ink/65">{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Button asChild className="mt-8 self-start">
                <Link to="/auth" search={{ role: s.cta.role }}>{s.cta.label}</Link>
              </Button>
            </GlassCard>
          ))}
        </section>

        <section id="faq" className="scroll-mt-24 pb-20">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="mt-2 font-display text-3xl md:text-4xl">Frequently asked questions</h2>
          <div className="mt-10 space-y-12">
            {FAQ.map((g) => (
              <div key={g.id} id={`faq-${g.id}`} className="scroll-mt-24">
                <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-ink/45">{g.title}</h3>
                <FaqList items={g.items} idPrefix={g.id} />
              </div>
            ))}
          </div>
          <p className="mt-12 text-[14px] text-ink/60">
            Another question? Email us at{" "}
            <a href="mailto:holidayclippers@proton.me" className="text-moss underline underline-offset-2">holidayclippers@proton.me</a>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
