import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Signs in to one of the seeded demo accounts. Public on purpose (used from the login page),
 * but only works while an admin has demo mode switched on. The demo password never leaves the server.
 */
export const startDemoSession = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ side: z.enum(["accommodation", "distribution"]) }).parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { DEMO_TOUR } = await import("./demo-seed-data");
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const password = process.env["DEMO_LOGIN_PASSWORD"];
    if (!password) throw new Error("The demo isn't set up yet.");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });

    const { data: enabled, error: modeErr } = await client.rpc("get_demo_mode");
    if (modeErr) throw new Error("Couldn't check demo mode. Try again.");
    if (!enabled) throw new Error("The demo is currently switched off.");

    const email = data.side === "accommodation" ? DEMO_TOUR.apEmail : DEMO_TOUR.dpEmail;
    const { data: auth, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !auth.session) throw new Error("The demo accounts aren't available. An admin needs to seed demo data first.");
    return { access_token: auth.session.access_token, refresh_token: auth.session.refresh_token };
  });
