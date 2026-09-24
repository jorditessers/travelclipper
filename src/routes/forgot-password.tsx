import { friendlyError } from "@/lib/errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GlassCard, Eyebrow } from "@/components/site/Primitives";
import { Brand } from "@/components/site/SiteHeader";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Vellum" },
      { name: "description", content: "Request a password reset link for your Vellum account." },
      { property: "og:title", content: "Reset your password — Vellum" },
      { property: "og:description", content: "Request a password reset link for your Vellum account." },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setSent(true);
    toast.success("Check your inbox");
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <div className="mx-auto w-full max-w-6xl px-6 py-6"><Brand /></div>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <GlassCard size="lg" className="w-full max-w-md p-8 fade-up">
          <Eyebrow>Password</Eyebrow>
          <h1 className="mt-3 font-display text-3xl">Forgot your password?</h1>
          {sent ? (
            <p className="mt-4 text-sm text-ink/60">
              If an account exists for <strong>{email}</strong>, you'll receive a link to set a new password.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink/70">Email</span>
                <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
            </form>
          )}
          <p className="mt-6 text-center text-[13px]">
            <Link to="/auth" className="font-medium text-moss hover:underline">Back to sign in</Link>
          </p>
        </GlassCard>
      </main>
    </div>
  );
}
