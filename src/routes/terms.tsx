import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Partner terms — Vellum" },
      { name: "description", content: "Terms for accommodation and distribution partners on Vellum." },
      { property: "og:title", content: "Partner terms — Vellum" },
      { property: "og:description", content: "Terms for accommodation and distribution partners on Vellum." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <Link to="/" className="text-sm text-ink/60 hover:text-ink">← Vellum</Link>
      <h1 className="mt-6 font-display text-4xl md:text-5xl">Partner terms</h1>
      <p className="mt-2 text-sm text-ink/50">Placeholder — final text to follow.</p>
      <div className="mt-10 space-y-6 leading-relaxed text-ink/80">
        <section>
          <h2 className="font-display text-2xl">1. Commission</h2>
          <p className="mt-2">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Placeholder text describing how commission on attributed bookings is agreed and paid.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl">2. Attribution</h2>
          <p className="mt-2">Lorem ipsum dolor sit amet. Placeholder text describing tracking links, partner codes and booking confirmation.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl">3. General</h2>
          <p className="mt-2">Lorem ipsum dolor sit amet. Placeholder text for general provisions.</p>
        </section>
      </div>
    </main>
  );
}
