import { createFileRoute } from "@tanstack/react-router";

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Holiday Clippers</title><meta name="robots" content="noindex"></head>
<body style="margin:0;background:#f4f0e6;font-family:Inter,Helvetica,Arial,sans-serif;color:#2a2621">
<main style="max-width:480px;margin:64px auto;padding:36px 32px;background:#fbf9f4;border-radius:20px">
<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px;color:#3b694c">Holiday Clippers</p>
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:normal;font-size:28px">${title}</h1>${body}
</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );

const invalid = () => page("This link doesn't work", `<p style="line-height:1.6;color:#4a453f">The unsubscribe link is incomplete or has expired. Reply to any of our emails and we'll take you off the list.</p>`, 400);

async function check(url: URL) {
  const u = url.searchParams.get("u") ?? "";
  const t = url.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(u) || !t) return null;
  const { verifyUnsubscribe } = await import("@/lib/emails.server");
  return (await verifyUnsubscribe(u, t)) ? u : null;
}

// GET shows a confirm button (so link scanners in mail apps can't unsubscribe anyone);
// POST unsubscribes, from that button or from the mail app's one-click unsubscribe.
export const Route = createFileRoute("/api/email/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (!(await check(url))) return invalid();
        return page("Unsubscribe from tips?", `<p style="line-height:1.6;color:#4a453f">You'll stop getting our onboarding tips. Emails about your account, stays and bookings will still reach you.</p>
<form method="post" action="${url.pathname}${url.search.replace(/"/g, "")}"><button type="submit" style="margin-top:16px;background:#2a2621;color:#f4f0e6;border:0;padding:12px 24px;border-radius:999px;font-size:15px;cursor:pointer">Unsubscribe</button></form>`);
      },
      POST: async ({ request }) => {
        const user = await check(new URL(request.url));
        if (!user) return invalid();
        const { unsubscribeFromTips } = await import("@/lib/emails.server");
        await unsubscribeFromTips(user);
        return page("You're unsubscribed", `<p style="line-height:1.6;color:#4a453f">You won't get our onboarding tips anymore. Emails about your account, stays and bookings will still reach you.</p><p><a href="https://www.holidayclippers.com" style="color:#3b694c">Back to Holiday Clippers</a></p>`);
      },
    },
  },
});
