import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || !data) throw new Error("Admins only");
}

export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const password = process.env["DEMO_LOGIN_PASSWORD"];
    if (!password || password.length < 8) throw new Error("Demo password secret is missing or too short");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { runDemoSeed } = await import("./demo-seed-run");
    return runDemoSeed(db, password);
  });

export const removeDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { runRemoveDemo } = await import("./demo-seed-run");
    return runRemoveDemo(db);
  });
