import { friendlyError } from "@/lib/errors";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Compass } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GlassCard, Eyebrow } from "@/components/site/Primitives";
import { accessQuery, homeFor } from "@/lib/access";
import { cn } from "@/lib/utils";

type PartnerRole = "accommodation_partner" | "distribution_partner";

export const Route = createFileRoute("/_authenticated/onboarding/role")({
  head: () => ({
    meta: [
      { title: "Choose your partner type — Vellum" },
      { name: "description", content: "Tell us how you work with Vellum." },
      { property: "og:title", content: "Choose your partner type — Vellum" },
      { property: "og:description", content: "Tell us how you work with Vellum." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const a = await context.queryClient.ensureQueryData(accessQuery);
    if (a.role) throw redirect({ href: homeFor(a) });
  },
  component: RolePage,
});

const OPTIONS: { value: PartnerRole; title: string; body: string; icon: typeof Building2 }[] = [
  {
    value: "accommodation_partner",
    title: "I'm an Accommodation Partner",
    body: "I want to make my accommodation available to new distribution partners and pay for results.",
    icon: Building2,
  },
  {
    value: "distribution_partner",
    title: "I'm a Distribution Partner",
    body: "I want to discover and promote exceptional stays and earn from bookings I generate.",
    icon: Compass,
  },
];

function RolePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [role, setRole] = useState<PartnerRole | null>(null);

  useEffect(() => {
    const v = sessionStorage.getItem("vellum.intendedRole");
    if (v === "accommodation_partner" || v === "distribution_partner") setRole(v);
  }, []);

  const m = useMutation({
    mutationFn: async () => {
      if (!role) throw new Error("Choose a partner type");
      const { error } = await supabase.rpc("choose_role", { _role: role });
      if (error) throw error;
    },
    onSuccess: async () => {
      sessionStorage.removeItem("vellum.intendedRole");
      await qc.invalidateQueries({ queryKey: accessQuery.queryKey });
      const a = await qc.fetchQuery(accessQuery);
      toast.success("Partner type saved");
      navigate({ href: homeFor(a), replace: true });
    },
    onError: (e) => toast.error(friendlyError(e, "Could not save. Please try again.")),
  });

  return (
    <div className="mx-auto max-w-3xl fade-up">
      <Eyebrow>Step 1 of 2</Eyebrow>
      <h1 className="mt-3 font-display text-4xl md:text-5xl">How will you use the platform?</h1>
      <p className="mt-3 max-w-xl text-ink/60">
        Choose carefully — you can't change this yourself later. If you ever need to switch, our
        support team can do it for you.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {OPTIONS.map((o) => (
          <button key={o.value} type="button" onClick={() => setRole(o.value)} className="text-left" aria-pressed={role === o.value}>
            <GlassCard className={cn("h-full p-6 transition", role === o.value && "ring-2 ring-moss")}>
              <o.icon className="size-5 text-moss" />
              <h2 className="mt-4 font-display text-2xl">{o.title}</h2>
              <p className="mt-2 text-sm text-ink/60">{o.body}</p>
            </GlassCard>
          </button>
        ))}
      </div>
      <div className="mt-8 flex justify-end">
        <Button size="lg" disabled={!role || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
