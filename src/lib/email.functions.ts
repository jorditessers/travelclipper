import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLocalDemo } from "@/integrations/demo-backend/mode";

/** Sends the queued transactional emails (see emails.server.ts). Any signed-in user may trigger a send. */
export const flushEmailOutbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { flushOutbox } = await import("./emails.server");
    return flushOutbox();
  });

/** Fire and forget after an action that queues an email. Never blocks or fails the action itself. */
export function sendQueuedEmails() {
  if (typeof window === "undefined" || isLocalDemo()) return; // the browser demo sends no email
  void flushEmailOutbox().catch((e) => console.warn("Emails not sent yet", e));
}
