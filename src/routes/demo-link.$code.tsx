import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassCard, Eyebrow } from "@/components/site/Primitives";
import { Brand } from "@/components/site/SiteHeader";
import { isLocalDemo } from "@/integrations/demo-backend/mode";

// Browser demo stand-in for /go/<code>: records the click in the local database and shows where a
// traveler would land. In the live product /go/<code> logs the click on the server and redirects.
export const Route = createFileRoute("/demo-link/$code")({
  ssr: false,
  head: () => ({ meta: [{ title: "Tracking link — Vellum demo" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type Result = { status: string; url?: string; code?: string; attributed?: boolean };

function Page() {
  const { code } = Route.useParams();
  const [r, setR] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isLocalDemo()) { window.location.replace(`/go/${code}`); return; }
    import("@/integrations/demo-backend").then((m) => m.localRecordClick(code)).then(setR, (e: Error) => setErr(e.message));
  }, [code]);

  let target: string | null = null;
  if (r?.status === "ok" && r.url) {
    try {
      const u = new URL(r.url);
      if (r.attributed && r.code) {
        u.searchParams.set("ref", r.code);
        u.searchParams.set("utm_source", "platform");
        u.searchParams.set("utm_medium", "distribution");
        u.searchParams.set("utm_campaign", r.code);
      }
      target = u.toString();
    } catch { target = null; }
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <div className="mx-auto w-full max-w-6xl px-6 py-6"><Brand /></div>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <GlassCard size="lg" className="w-full max-w-lg p-8">
          <Eyebrow>Tracking link · {code}</Eyebrow>
          {!r && !err && <p className="mt-4 text-sm text-ink/60">Recording the click…</p>}
          {err && <p className="mt-4 text-sm text-clay">{err}</p>}
          {r && r.status === "rate_limited" && <h1 className="mt-3 font-display text-3xl">Too many clicks — wait a minute and try again.</h1>}
          {r && r.status !== "ok" && r.status !== "rate_limited" && (
            <h1 className="mt-3 font-display text-3xl">This link is no longer active</h1>
          )}
          {target && (
            <>
              <h1 className="mt-3 font-display text-3xl">Click recorded</h1>
              <p className="mt-3 text-sm text-ink/70">
                In the live product the traveler goes straight to the stay's own booking page, with the partner code attached so the
                booking can be attributed:
              </p>
              <p className="mt-3 break-all rounded-xl bg-mist/60 px-4 py-3 font-mono text-[12px] text-ink/80">{target}</p>
              <p className="mt-3 text-sm text-ink/60">The demo stays use example addresses, so there's no real booking page behind this link.</p>
            </>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild><Link to="/dashboard">Back to the demo</Link></Button>
          </div>
        </GlassCard>
      </main>
    </div>
  );
}
