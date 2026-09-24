import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startDemoSession } from "@/lib/demo-session.functions";
import { isLocalDemo, LOCAL_DEMO_ADMIN_EMAIL, LOCAL_DEMO_PASSWORD } from "@/integrations/demo-backend/mode";

export type DemoSide = "accommodation" | "distribution";

export function useDemoModeEnabled() {
  return useQuery({
    queryKey: ["demo-mode-enabled"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_demo_mode");
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 60_000,
  });
}

export function useDemoSide() {
  return useQuery({
    queryKey: ["my-demo-side"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_demo_side");
      if (error) throw error;
      return (data as DemoSide | null) ?? null;
    },
    staleTime: Infinity,
  });
}

export function useDemoTourStay(enabled: boolean) {
  return useQuery({
    queryKey: ["demo-tour-stay"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_demo_tour_accommodation_id");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

/** Signs in as a demo account (server-side) and swaps the browser session. */
export async function enterDemo(side: DemoSide | "admin", qc: QueryClient) {
  if (isLocalDemo()) {
    // Browser demo: the demo accounts live in this browser's database, so sign in directly.
    const { DEMO_TOUR } = await import("@/lib/demo-seed-data");
    const email = side === "admin" ? LOCAL_DEMO_ADMIN_EMAIL : side === "accommodation" ? DEMO_TOUR.apEmail : DEMO_TOUR.dpEmail;
    await qc.cancelQueries();
    qc.clear();
    const { error } = await supabase.auth.signInWithPassword({ email, password: LOCAL_DEMO_PASSWORD });
    if (error) throw error;
    return;
  }
  if (side === "admin") throw new Error("The admin demo is only available in the browser demo.");
  const tokens = await startDemoSession({ data: { side } });
  await qc.cancelQueries();
  qc.clear();
  const { error } = await supabase.auth.setSession(tokens);
  if (error) throw error;
}

// ---- Tour state (per browser) ----
const KEY = "vellum.demoTour";
export type TourState = { step: number; open: boolean };
export function readTour(): TourState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "");
    if (typeof v?.step === "number") return { step: v.step, open: Boolean(v.open) };
  } catch { /* ignore */ }
  return { step: 0, open: true };
}
export function writeTour(s: TourState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("vellum-demo-tour"));
}
