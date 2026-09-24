import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startDemoSession } from "@/lib/demo-session.functions";

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
export async function enterDemo(side: DemoSide, qc: QueryClient) {
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
