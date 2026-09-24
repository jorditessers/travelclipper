import { friendlyError } from "@/lib/errors";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, Sparkles, Users } from "lucide-react";
import { liveCampaign, shortDate } from "@/lib/campaigns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/app/ui-kit";
import { ASSET_BUCKET, SIGNED_URL_TTL } from "@/lib/assets";
import { accommodationTypeLabel, marketLabel, nicheLabel, type AccommodationType, type Niche } from "@/lib/constants";
import { cn } from "@/lib/utils";

const COUNTRY_NAMES: Record<string, string> = { ID: "Indonesia", TZ: "Tanzania" };
export const countryName = (c: string) => COUNTRY_NAMES[c] ?? marketLabel(c);

export const STAY_SELECT =
  "id, name, city, region, country, accommodation_type, max_guests, starting_price_per_night, niches, created_at, effective_pool_pct, accommodation_distribution_settings!inner(commission_pool_pct, distribution_enabled), accommodation_assets(storage_path, external_url, is_cover), commission_campaigns(name, commission_pool_pct, starts_on, ends_on)";

export type StayCardData = {
  id: string; name: string; city: string | null; country: string | null; accommodation_type: AccommodationType | null;
  max_guests: number | null; starting_price_per_night: number | null; niches: Niche[]; coverUrl: string | null; earn: number;
  boost: { name: string; endsOn: string } | null;
};

export const earnPct = (pool: number | string, share: number) => Math.round(Number(pool) * share * 10) / 10;

export async function signedOrExternal(a: { storage_path: string | null; external_url: string | null } | undefined) {
  if (!a) return null;
  if (a.storage_path) {
    const { data } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(a.storage_path, SIGNED_URL_TTL);
    return data?.signedUrl ?? null;
  }
  return a.external_url;
}

export async function toStayCards(rows: any[], share: number): Promise<StayCardData[]> {
  return Promise.all(rows.map(async (a) => {
    const live = liveCampaign(a.commission_campaigns);
    return {
      id: a.id, name: a.name, city: a.city, country: a.country, accommodation_type: a.accommodation_type,
      max_guests: a.max_guests, starting_price_per_night: a.starting_price_per_night, niches: a.niches,
      coverUrl: await signedOrExternal(a.accommodation_assets.find((x: any) => x.is_cover)),
      earn: earnPct(a.effective_pool_pct ?? a.accommodation_distribution_settings.commission_pool_pct, share),
      boost: live ? { name: live.name, endsOn: live.ends_on } : null,
    };
  }));
}

export function BoostBadge({ earn, endsOn, className }: { earn: number; endsOn: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-clay/10 px-2.5 py-0.5 text-[11px] font-medium text-clay", className)}>
      <Sparkles className="size-3" /> Boost: earn {earn}% until {shortDate(endsOn)}
    </span>
  );
}

/* ---------- Saved (optimistic) ---------- */
const SAVED_KEY = ["saved-ids"];
export function useSavedIds() {
  return useQuery({
    queryKey: SAVED_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("saved_accommodations").select("accommodation_id");
      if (error) throw error;
      return new Set(data.map((r) => r.accommodation_id));
    },
  });
}

export function useToggleSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, save }: { id: string; save: boolean }) => {
      if (save) {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("Not signed in");
        const { error } = await supabase.from("saved_accommodations").insert({ user_id: u.user.id, accommodation_id: id });
        if (error && error.code !== "23505") throw error;
        await supabase.rpc("log_event", { _event_type: "opportunity_saved", _accommodation_id: id });
      } else {
        const { error } = await supabase.from("saved_accommodations").delete().eq("accommodation_id", id);
        if (error) throw error;
      }
      return save;
    },
    onMutate: async ({ id, save }) => {
      await qc.cancelQueries({ queryKey: SAVED_KEY });
      const prev = qc.getQueryData<Set<string>>(SAVED_KEY);
      const next = new Set(prev ?? []);
      save ? next.add(id) : next.delete(id);
      qc.setQueryData(SAVED_KEY, next);
      return { prev };
    },
    onError: (e: Error, _v, ctx) => { qc.setQueryData(SAVED_KEY, ctx?.prev); toast.error(friendlyError(e)); },
    onSuccess: (save) => toast.success(save ? "Saved" : "Removed from saved"),
    onSettled: () => { qc.invalidateQueries({ queryKey: SAVED_KEY }); qc.invalidateQueries({ queryKey: ["saved-list"] }); },
  });
}

export function SaveButton({ id, className, withLabel }: { id: string; className?: string; withLabel?: boolean }) {
  const saved = useSavedIds();
  const toggle = useToggleSave();
  const on = saved.data?.has(id) ?? false;
  return (
    <button type="button" aria-pressed={on} aria-label={on ? "Remove from saved" : "Save stay"} disabled={saved.isLoading}
      onClick={() => toggle.mutate({ id, save: !on })}
      className={cn(withLabel
        ? "inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border text-sm hover:border-ink/40"
        : "grid size-9 place-items-center rounded-full bg-paper/90 text-ink backdrop-blur hover:bg-paper", className)}>
      <Bookmark className={cn("size-4", on && "fill-current")} />
      {withLabel && (on ? "Saved" : "Save")}
    </button>
  );
}

export function StayCard({ a }: { a: StayCardData }) {
  return (
    <Card className="group flex h-full flex-col overflow-hidden p-0">
      <div className="relative aspect-[4/3] overflow-hidden bg-mist">
        {a.coverUrl && <img src={a.coverUrl} alt={a.name} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" />}
        <span className="absolute left-3 top-3 rounded-full bg-moss px-3 py-1 text-[12px] font-medium text-paper">You earn {a.earn}%</span>
        <SaveButton id={a.id} className="absolute right-3 top-3" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="eyebrow">{accommodationTypeLabel(a.accommodation_type)}</p>
          <h3 className="mt-1 font-display text-xl leading-tight">{a.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{[a.city, a.country && countryName(a.country)].filter(Boolean).join(", ")}</p>
          {a.boost && <BoostBadge earn={a.earn} endsOn={a.boost.endsOn} className="mt-2" />}
        </div>
        <p className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {a.max_guests}</span>
          <span className="text-ink/30">·</span>
          <span>from €{Number(a.starting_price_per_night).toLocaleString("en-IE", { maximumFractionDigits: 0 })} / night</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {a.niches.slice(0, 3).map((n) => <span key={n} className="rounded-full bg-mist px-2.5 py-0.5 text-[11px]">{nicheLabel(n)}</span>)}
        </div>
        <div className="mt-auto pt-2">
          <Button variant="outline" className="w-full" asChild>
            <Link to="/distribution/opportunities/$id" params={{ id: a.id }}>View opportunity</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
