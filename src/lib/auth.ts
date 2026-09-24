import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/constants";

/** Browser-only session hook. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export const meQueryKey = ["me"] as const;

/** Profile + roles of the signed-in user (RLS: own rows only). */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: meQueryKey,
    enabled,
    queryFn: async () => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw userErr ?? new Error("Not signed in");
      const uid = userData.user.id;
      const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      return {
        user: userData.user,
        profile,
        roles: roleList,
        primaryRole: (roleList.find((r) => r !== "admin") ?? roleList[0] ?? null) as AppRole | null,
        onboarded: roleList.length > 0 && !!profile,
      };
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    await supabase.auth.signOut();
    qc.clear();
  };
}
