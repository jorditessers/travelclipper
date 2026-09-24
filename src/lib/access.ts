import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/constants";

export type Access = {
  userId: string;
  email: string | null;
  role: AppRole | null;
  onboardingCompleted: boolean;
};

export const accessQuery = queryOptions({
  queryKey: ["access"],
  staleTime: 30_000,
  queryFn: async (): Promise<Access> => {
    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr || !u.user) throw uErr ?? new Error("Not signed in");
    // Creates the profile row on first sign-in (idempotent).
    const { error: eErr } = await supabase.rpc("ensure_my_profile");
    if (eErr) throw eErr;
    const [{ data: p, error: pErr }, { data: r, error: rErr }] = await Promise.all([
      supabase.from("profiles").select("onboarding_completed").eq("id", u.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", u.user.id).maybeSingle(),
    ]);
    if (pErr) throw pErr;
    if (rErr) throw rErr;
    return {
      userId: u.user.id,
      email: u.user.email ?? null,
      role: (r?.role as AppRole | undefined) ?? null,
      onboardingCompleted: !!p?.onboarding_completed,
    };
  },
});

export const ROLE_BASE: Record<AppRole, "/accommodation" | "/distribution" | "/admin"> = {
  accommodation_partner: "/accommodation",
  distribution_partner: "/distribution",
  admin: "/admin",
};

/** Where a user belongs right now. */
export function homeFor(a: Access): string {
  if (!a.role) return "/onboarding/role";
  if (a.role === "admin") return "/admin/overview";
  if (!a.onboardingCompleted) {
    return a.role === "accommodation_partner" ? "/onboarding/accommodation" : "/onboarding/distribution";
  }
  return `${ROLE_BASE[a.role]}/dashboard`;
}

/** beforeLoad guard: only `role` with completed onboarding may enter. */
export async function requireRole(qc: QueryClient, role: AppRole) {
  const a = await qc.ensureQueryData(accessQuery);
  const ok = a.role === role && (role === "admin" || a.onboardingCompleted);
  if (!ok) throw redirect({ href: homeFor(a) });
  return { access: a };
}
