import { createFileRoute } from "@tanstack/react-router";

const CODE = /^[A-Za-z]{3}-[A-Za-z0-9]{5}$/;

function page(title: string, body: string, status: number) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} — Vellum</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f1e8;color:#1f1d1a;font-family:Georgia,serif}
main{max-width:440px;padding:40px 28px;text-align:center}h1{font-weight:400;font-size:30px;margin:0 0 12px}
p{font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#5b574f;margin:0}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

const inactive = () => page("This link is no longer active", "The stay you were looking for may have moved. Please contact the person who shared this link.", 404);

export const Route = createFileRoute("/go/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!CODE.test(params.code)) return inactive();
        const h = request.headers;
        const ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("record_click", {
          _code: params.code,
          _ip: ip, // hashed with a daily salt inside the database; never stored raw
          _referrer: h.get("referer") ?? "",
          _user_agent: h.get("user-agent") ?? "",
        });
        if (error) {
          console.error("record_click failed", error.message);
          return page("Something went wrong", "Please try again in a moment.", 500);
        }
        const r = data as { status: string; url?: string; code?: string; attributed?: boolean };
        if (r.status === "rate_limited") return page("Too many requests", "Please wait a minute and try again.", 429);
        if (r.status !== "ok" || !r.url) return inactive();

        // Destination is always the accommodation's stored URL, never taken from the request.
        let target: URL;
        try { target = new URL(r.url); } catch { return inactive(); }
        if (target.protocol !== "https:") return inactive();
        if (r.attributed && r.code) {
          target.searchParams.set("ref", r.code);
          target.searchParams.set("utm_source", "platform");
          target.searchParams.set("utm_medium", "distribution");
          target.searchParams.set("utm_campaign", r.code);
        }
        return new Response(null, {
          status: 302,
          headers: { location: target.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer-when-downgrade" },
        });
      },
    },
  },
});
