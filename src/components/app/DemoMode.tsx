import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { friendlyError } from "@/lib/errors";
import { enterDemo, readTour, useDemoSide, useDemoTourStay, writeTour, type DemoSide, type TourState } from "@/lib/demo";

type Step = {
  chapter: number;
  side: DemoSide;
  title: string;
  body: string;
  href: (stay: string) => string;
};

const STEPS: Step[] = [
  { chapter: 1, side: "accommodation", title: "Make the stay commissionable",
    body: "Finca Es Garrover is live, but without a commission pool no partner can see it. Choose 12% and save. The calculator shows how a booking splits between partner and platform.",
    href: (id) => `/accommodation/accommodations/${id}?tab=commission` },
  { chapter: 2, side: "accommodation", title: "Make content available",
    body: "One photo is still private. Switch it on so Distribution Partners can download and use it under the accommodation's terms.",
    href: (id) => `/accommodation/accommodations/${id}?tab=content` },
  { chapter: 3, side: "distribution", title: "A partner discovers the stay",
    body: "Lena Wanders, a travel creator, only sees stays that carry commission. Finca Es Garrover now appears under Recommended for you, matched on her niches and markets.",
    href: () => `/distribution/discover?sort=recommended` },
  { chapter: 4, side: "distribution", title: "Create a tracking link",
    body: "Choose Get tracking link. Clicks and bookings through this link are attributed to Lena.",
    href: (id) => `/distribution/opportunities/${id}` },
  { chapter: 5, side: "distribution", title: "Report the booking",
    body: "A reader booked directly with the accommodation. Choose Report a booking and submit it, for example €3,000 for five nights.",
    href: (id) => `/distribution/opportunities/${id}` },
  { chapter: 5, side: "accommodation", title: "Confirm the booking",
    body: "The accommodation checks the reservation in its own system and confirms it. The commission is calculated and fixed at that moment.",
    href: () => `/accommodation/bookings` },
  { chapter: 6, side: "accommodation", title: "Commission owed",
    body: "The accommodation sees what it owes: the commission pool on confirmed bookings, invoiced monthly outside the platform.",
    href: () => `/accommodation/dashboard?period=all` },
  { chapter: 6, side: "distribution", title: "Commission earned",
    body: "Lena sees the same booking as confirmed commission: her share of the pool. It counts as earned once the stay has taken place.",
    href: () => `/distribution/bookings` },
];
const TOTAL_CHAPTERS = 6;

function useTourState(): [TourState, (s: TourState) => void] {
  const [s, setS] = useState<TourState>({ step: 0, open: false });
  useEffect(() => {
    const sync = () => setS(readTour());
    sync();
    window.addEventListener("vellum-demo-tour", sync);
    return () => window.removeEventListener("vellum-demo-tour", sync);
  }, []);
  return [s, writeTour];
}

export function DemoLayer() {
  const side = useDemoSide();
  if (!side.data) return null;
  return <DemoInner side={side.data} />;
}

function DemoInner({ side }: { side: DemoSide }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tour, setTour] = useTourState();
  const stay = useDemoTourStay(true);
  const [switching, setSwitching] = useState(false);
  const [showFlow, setShowFlow] = useState(false);

  const reset = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc("reset_demo"); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries(); toast.success("Demo reset to its starting point"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const go = async (step: number) => {
    if (step >= STEPS.length) { setTour({ step: STEPS.length, open: false }); setShowFlow(true); return; }
    const target = STEPS[step]!;
    setTour({ step, open: true });
    if (!stay.data) return;
    if (target.side !== side) {
      setSwitching(true);
      try { await enterDemo(target.side, qc); } catch (e) { toast.error(friendlyError(e)); setSwitching(false); return; }
      window.location.assign(target.href(stay.data)); // full load so role-based routes pick up the new session
      return;
    }
    navigate({ href: target.href(stay.data) });
  };

  const switchSide = async () => {
    setSwitching(true);
    try {
      const other: DemoSide = side === "accommodation" ? "distribution" : "accommodation";
      await enterDemo(other, qc);
      window.location.assign(other === "accommodation" ? "/accommodation/dashboard" : "/distribution/dashboard");
    } catch (e) { toast.error(friendlyError(e)); setSwitching(false); }
  };

  const step = STEPS[tour.step];

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-mist/70 px-4 py-2 text-[12.5px] md:px-8">
        <span className="font-medium">Demo mode</span>
        <span className="text-muted-foreground">
          Viewing as {side === "accommodation" ? "Accommodation Partner · Casa Serena Villas" : "Distribution Partner · Lena Wanders"}. Read-only except the tour steps.
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[12.5px]" onClick={switchSide} disabled={switching}>Switch side</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[12.5px]" onClick={() => go(0)} disabled={switching || !stay.data}>Restart tour</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[12.5px]" onClick={() => reset.mutate()} disabled={reset.isPending}>
            <RotateCcw className="size-3.5" /> {reset.isPending ? "Resetting…" : "Reset demo"}
          </Button>
        </div>
      </div>

      {tour.open && step && (
        <div role="dialog" aria-label="Demo tour" className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border bg-background p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-sage">Step {step.chapter} of {TOTAL_CHAPTERS} · {step.side === "accommodation" ? "Accommodation" : "Distribution"}</p>
            <button aria-label="Skip tour" className="text-muted-foreground hover:text-foreground" onClick={() => setTour({ ...tour, open: false })}>
              <X className="size-4" />
            </button>
          </div>
          <h3 className="mt-2 font-display text-lg">{step.title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{step.body}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-mist">
            <div className="h-full bg-moss transition-all" style={{ width: `${((tour.step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => setTour({ ...tour, open: false })}>Skip tour</Button>
            <div className="flex gap-2">
              {step.side !== side || !stay.data ? null : (
                <Button size="sm" variant="outline" onClick={() => navigate({ href: step.href(stay.data!) })}>Show me</Button>
              )}
              <Button size="sm" onClick={() => (step.side !== side ? go(tour.step) : go(tour.step + 1))} disabled={switching || stay.isLoading}>
                {switching ? "Switching…" : step.side !== side ? `Continue as ${step.side === "accommodation" ? "accommodation" : "partner"}` : tour.step === STEPS.length - 1 ? "See the model" : "Next"}
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <DemoFlowDialog open={showFlow} onOpenChange={setShowFlow} />
    </>
  );
}

const eur = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Number(n));

function DemoFlowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const q = useQuery({
    queryKey: ["demo-tour-summary"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("demo_tour_summary");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const b = q.data;
  const confirmed = b && (b.status === "confirmed" || b.status === "completed");
  const nodes = [
    { label: "Accommodation", name: b?.accommodation_name ?? "The accommodation",
      line: "Supplies the stay and content, sets the commission pool.", amount: b ? `Receives ${eur(b.booking_value)} · pays ${eur(b.commission_total)} (${Number(b.commission_pool_pct ?? 0)}%)` : null },
    { label: "Platform", name: "Vellum",
      line: "Infrastructure: listings, content, tracking and attribution.", amount: b ? `Keeps ${eur(b.platform_commission)}` : null },
    { label: "Distribution Partner", name: b?.partner_brand ?? "The partner",
      line: "Brings the audience and the trust.", amount: b ? `Earns ${eur(b.partner_commission)}` : null },
    { label: "Traveler", name: "Books directly",
      line: "Pays the accommodation; not a platform user.", amount: b ? `Pays ${eur(b.booking_value)}` : null },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="font-display text-2xl font-normal">How value moves</DialogTitle>
        <DialogDescription>
          {q.isLoading ? "Loading the demo booking…" : q.error ? "We couldn't load the demo booking." : !b ? "No booking in this demo run yet — complete steps 5 and 6 to see real amounts." : confirmed ? "Amounts from the booking confirmed in this demo." : "The booking in this demo is not confirmed yet, so commission is not fixed."}
        </DialogDescription>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          {nodes.map((n, i) => (
            <div key={n.label} className="relative rounded-2xl border bg-paper/60 p-4">
              <p className="eyebrow text-sage">{n.label}</p>
              <p className="mt-1 font-display text-base">{n.name}</p>
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">{n.line}</p>
              {n.amount && confirmed && <p className="mt-3 text-[13px] font-medium">{n.amount}</p>}
              {i < nodes.length - 1 && (
                <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground md:block" />
              )}
            </div>
          ))}
        </div>
        {confirmed && b && (
          <p className="text-[13px] text-muted-foreground">
            Commission pool {eur(b.commission_total)} = {eur(b.partner_commission)} to the partner + {eur(b.platform_commission)} to the platform. No booking, no cost.
          </p>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
