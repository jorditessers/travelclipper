import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

type DraftRole = "accommodation_partner" | "distribution_partner";

/**
 * Saves the onboarding answers so far (step = the step the user is on, 1-based).
 * Best effort: a failed save never blocks onboarding.
 */
export async function saveOnboardingDraft(role: DraftRole, step: number, answers: Record<string, unknown>, completed = false) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("onboarding_drafts").upsert(
      { user_id: u.user.id, role, step, answers: answers as Json, ...(completed ? { completed_at: new Date().toISOString() } : {}) },
      { onConflict: "user_id" },
    );
    if (error) console.warn("Onboarding draft not saved", error.message);
  } catch (e) {
    console.warn("Onboarding draft not saved", e);
  }
}

/** The user's unfinished draft for this role, e.g. when they continue on another device. */
export async function loadOnboardingDraft(role: DraftRole): Promise<{ step: number; answers: Record<string, unknown> } | null> {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data } = await supabase.from("onboarding_drafts").select("role, step, answers, completed_at").eq("user_id", u.user.id).maybeSingle();
    if (!data || data.role !== role || data.completed_at || !data.answers || typeof data.answers !== "object" || Array.isArray(data.answers)) return null;
    return { step: data.step, answers: data.answers as Record<string, unknown> };
  } catch {
    return null;
  }
}
