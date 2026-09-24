import { friendlyError } from "@/lib/errors";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { GlassCard, Eyebrow } from "@/components/site/Primitives";
import { Brand } from "@/components/site/SiteHeader";
import { useSession } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { enterDemo, useDemoModeEnabled, writeTour, type DemoSide } from "@/lib/demo";

function DemoEntry() {
  const enabled = useDemoModeEnabled();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<DemoSide | null>(null);
  if (!enabled.data) return null;
  const start = async (side: DemoSide) => {
    setBusy(side);
    try {
      writeTour({ step: side === "accommodation" ? 0 : 2, open: true });
      await enterDemo(side, qc);
      window.location.assign("/dashboard"); // full load so the demo session is picked up cleanly
    } catch (err) {
      toast.error(friendlyError(err));
      setBusy(null);
    }
  };
  return (
    <div className="mt-6 border-t border-ink/10 pt-5">
      <p className="text-center text-[11px] uppercase tracking-wider text-ink/40">Explore the demo</p>
      <div className="mt-3 grid gap-2">
        <Button variant="outline" className="w-full" disabled={!!busy} onClick={() => start("accommodation")}>
          {busy === "accommodation" ? "Opening demo…" : "View demo as Accommodation Partner"}
        </Button>
        <Button variant="outline" className="w-full" disabled={!!busy} onClick={() => start("distribution")}>
          {busy === "distribution" ? "Opening demo…" : "View demo as Distribution Partner"}
        </Button>
      </div>
    </div>
  );
}

const searchSchema = z.object({
  role: z.enum(["accommodation_partner", "distribution_partner"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Vellum" },
      { name: "description", content: "Sign in or create your Vellum partner account." },
      { property: "og:title", content: "Sign in — Vellum" },
      { property: "og:description", content: "Sign in or create your Vellum partner account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { role } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">(role ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (role) sessionStorage.setItem("vellum.intendedRole", role);
  }, [role]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your inbox", {
            description: "We sent you a confirmation link. Sign in after confirming.",
          });
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      }
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <Brand />
      </div>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="relative w-full max-w-md fade-up">
          <div className="absolute -right-8 -top-10 size-40 rounded-full bg-sage/25 blur-3xl" />
          <div className="absolute -bottom-8 -left-6 size-32 rounded-full bg-clay/20 blur-3xl" />
          <GlassCard size="lg" className="relative p-8">
            <Eyebrow>
              {role === "accommodation_partner"
                ? "Accommodation partner"
                : role === "distribution_partner"
                  ? "Distribution partner"
                  : "Partner access"}
            </Eyebrow>
            <h1 className="mt-3 font-display text-3xl">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 text-sm text-ink/60">
              {mode === "signup"
                ? "Join the network. You'll choose your partner type next."
                : "Sign in to manage your inventory or find stays to distribute."}
            </p>

            <Button variant="outline" className="mt-6 w-full" onClick={handleGoogle} disabled={busy}>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                <path fill="currentColor" d="M21.35 11.1H12v2.9h5.35c-.25 1.5-1.7 4.4-5.35 4.4a6.4 6.4 0 1 1 0-12.8c1.85 0 3.1.8 3.8 1.45l2.6-2.5A10 10 0 1 0 12 22c5.75 0 9.55-4.05 9.55-9.75 0-.65-.05-1.15-.2-1.15Z" />
              </svg>
              Continue with Google
            </Button>

            <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-ink/40">
              <span className="h-px flex-1 bg-ink/10" />
              or with email
              <span className="h-px flex-1 bg-ink/10" />
            </div>

            <form onSubmit={handleEmail} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink/70">Email</span>
                <input
                  className="field"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-ink/70">Password</span>
                <input
                  className="field"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>

            {mode === "signin" && (
              <p className="mt-4 text-center text-[13px]">
                <Link to="/forgot-password" className="text-ink/60 underline-offset-4 hover:text-ink hover:underline">
                  Forgot your password?
                </Link>
              </p>
            )}

            <p className="mt-6 text-center text-[13px] text-ink/60">
              {mode === "signup" ? "Already a partner?" : "New to Vellum?"}{" "}
              <button
                type="button"
                className="font-medium text-moss underline-offset-4 hover:underline"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
            <DemoEntry />
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
