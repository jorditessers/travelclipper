import { ConfirmAction } from "@/components/app/ConfirmAction";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { usePlatformSettings } from "@/components/accommodations/CommissionSettings";
import { STAY_SELECT, StayCard, countryName, toStayCards, useToggleSave } from "@/components/distribution/stays";

export const Route = createFileRoute("/_authenticated/distribution/saved")({
  head: () => ({
    meta: [
      { title: "Saved stays — Vellum" },
      { name: "description", content: "Stays you've shortlisted to promote." },
      { property: "og:title", content: "Saved stays — Vellum" },
      { property: "og:description", content: "Stays you've shortlisted to promote." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const platform = usePlatformSettings();
  const toggle = useToggleSave();
  const q = useQuery({
    queryKey: ["saved-list", platform.data?.partnerShare],
    enabled: platform.isSuccess,
    queryFn: async () => {
      const { data: saved, error } = await supabase.rpc("get_my_saved_accommodations");
      if (error) throw error;
      const ids = saved.filter((s) => s.is_available).map((s) => s.accommodation_id);
      let cards: Awaited<ReturnType<typeof toStayCards>> = [];
      if (ids.length) {
        const { data, error: e2 } = await supabase.from("accommodations").select(STAY_SELECT).in("id", ids);
        if (e2) throw e2;
        cards = await toStayCards(data, platform.data!.partnerShare);
      }
      const byId = new Map(cards.map((c) => [c.id, c]));
      return saved.map((s) => ({ ...s, card: byId.get(s.accommodation_id) }));
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Distribution" title="Saved" description="Stays you've shortlisted to promote." />
      {(q.isLoading || platform.isLoading) && <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}</div>}
      {(q.error || platform.error) && <EmptyState icon={Bookmark} title="Couldn't load your saved stays" description="We couldn't load this right now. Check your connection and try again."
        action={<Button variant="outline" onClick={() => { platform.refetch(); q.refetch(); }}>Retry</Button>} />}
      {q.data?.length === 0 && <EmptyState icon={Bookmark} title="Nothing saved yet" description="Start exploring opportunities and save the stays that fit your audience or clients."
        action={<Button asChild><Link to="/distribution/discover">Discover stays</Link></Button>} />}
      {q.data && q.data.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((s) => (
            <li key={s.accommodation_id}>
              {s.card ? <StayCard a={s.card} /> : (
                <Card className="flex h-full flex-col justify-between gap-6 p-5 opacity-80">
                  <div>
                    <p className="eyebrow text-clay">No longer available</p>
                    <h3 className="mt-1 font-display text-xl">{s.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{[s.city, s.country && countryName(s.country)].filter(Boolean).join(", ")}</p>
                    <p className="mt-3 text-sm text-muted-foreground">This stay is paused or no longer open for distribution.</p>
                  </div>
                  <ConfirmAction title="Remove from saved?" description="This stay is no longer available, so you won't be able to save it again until it returns."
                    confirmLabel="Remove" onConfirm={() => toggle.mutate({ id: s.accommodation_id, save: false })}
                    trigger={<Button variant="outline">Remove</Button>} />
                </Card>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
