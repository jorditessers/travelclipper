import { friendlyError } from "@/lib/errors";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GlassCard, Eyebrow } from "@/components/site/Primitives";
import { Brand } from "@/components/site/SiteHeader";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Vellum" },
      { name: "description", content: "Choose a new password for your Vellum account." },
      { property: "og:title", content: "Set a new password — Vellum" },
      { property: "og:description", content: "Choose a new password for your Vellum account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    if (window.location.hash.includes("type=recovery")) setReady(true);
    supabase.auth.getSession().then(({ data: d }) => d.session && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords don't match"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Password updated");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <div className="mx-auto w-full max-w-6xl px-6 py-6"><Brand /></div>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <GlassCard size="lg" className="w-full max-w-md p-8 fade-up">
          <Eyebrow>Password</Eyebrow>
          <h1 className="mt-3 font-display text-3xl">Set a new password</h1>
          {!ready ? (
            <p className="mt-4 text-sm text-ink/60">Open this page from the link in your reset email.</p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <input className="field" type="password" placeholder="New password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <input className="field" type="password" placeholder="Confirm password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
            </form>
          )}
        </GlassCard>
      </main>
    </div>
  );
}
