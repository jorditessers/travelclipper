import { createFileRoute } from "@tanstack/react-router";

// Called once a day by Vercel Cron (see scripts/add-vercel-crons.mjs): queues the onboarding tips
// that are due and sends every queued email. Safe to run more often; nothing is sent twice.
export const Route = createFileRoute("/api/cron/daily")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { flushOutbox } = await import("@/lib/emails.server");
        const { data: queued, error } = await supabaseAdmin.rpc("enqueue_tip_emails");
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        let sent = 0;
        let failed = 0;
        // Send in batches until the queue is empty (each flush handles up to 20 rows).
        for (let i = 0; i < 10; i++) {
          const r = await flushOutbox();
          sent += r.sent;
          failed += r.failed;
          if (!r.configured || r.sent + r.failed === 0) break;
        }
        return Response.json({ ok: true, queued, sent, failed });
      },
    },
  },
});
