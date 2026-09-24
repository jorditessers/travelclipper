import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ImageIcon, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/app/ui-kit";
import {
  ACCOMMODATION_STATUS_LABEL, accommodationDetailsComplete, accommodationTypeLabel, marketLabel,
  type AccommodationStatus,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/accommodation/accommodations/")({
  head: () => ({
    meta: [
      { title: "Accommodations — Vellum" },
      { name: "description", content: "Your stays, their status and what's left to complete." },
      { property: "og:title", content: "Accommodations — Vellum" },
      { property: "og:description", content: "Your stays, their status and what's left to complete." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const TONE: Record<AccommodationStatus, "neutral" | "clay" | "moss" | "outline"> = {
  draft: "neutral",
  pending_review: "clay",
  active: "moss",
  paused: "outline",
  published: "moss",
};

function Page() {
  const q = useQuery({
    queryKey: ["my-accommodations"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("accommodations")
        .select("*, accommodation_assets(asset_type, is_cover, approved_for_distribution), accommodation_distribution_settings(commission_pool_pct)")
        .eq("owner_id", u.user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addBtn = (
    <Button asChild>
      <Link to="/accommodation/accommodations/new"><Plus className="size-4" /> Add accommodation</Link>
    </Button>
  );

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Supply" title="Accommodations" description="Your stays, their status and what's left before distribution partners can promote them." actions={addBtn} />

      {q.isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {q.error && (
        <EmptyState icon={Building2} title="Couldn't load your accommodations" description="We couldn't load this right now. Check your connection and try again."
          action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
      )}
      {q.data && q.data.length === 0 && (
        <EmptyState icon={Building2} title="Your distribution network starts with your first stay." description="Add a stay, set your commission and upload content so Distribution Partners can promote it." action={addBtn} />
      )}
      {q.data && q.data.length > 0 && (
        <ul className="space-y-3">
          {q.data.map((a) => {
            const checks = [
              { label: "Details", done: accommodationDetailsComplete(a) },
              { label: "Content", done: a.accommodation_assets.some((x) => x.is_cover) && a.accommodation_assets.filter((x) => x.asset_type === "photo" && x.approved_for_distribution).length >= 3 },
              { label: "Commission", done: a.accommodation_distribution_settings?.commission_pool_pct != null },
              { label: "Submitted", done: a.status !== "draft" },
            ];
            return (
              <li key={a.id}>
                <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to="/accommodation/accommodations/$id" params={{ id: a.id }} className="truncate font-display text-xl hover:underline">{a.name}</Link>
                      <Badge tone={TONE[a.status]}>{ACCOMMODATION_STATUS_LABEL[a.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[accommodationTypeLabel(a.accommodation_type), [a.city, a.country && marketLabel(a.country)].filter(Boolean).join(", ")]
                        .filter(Boolean).join(" · ") || "Details incomplete"}
                    </p>
                    <ol className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                      {checks.map((c, i) => (
                        <li key={c.label} className={cn("inline-flex items-center gap-1", c.done ? "text-moss" : "text-ink/45")}>
                          {c.done && <Check className="size-3" />}
                          {c.label}
                          {i < checks.length - 1 && <span className="ml-3 text-ink/25">·</span>}
                        </li>
                      ))}
                    </ol>
                    {a.review_note && <p className="mt-2 text-[12px] text-clay">Review note: {a.review_note}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <Link to="/accommodation/accommodations/$id" params={{ id: a.id }} search={{ tab: "content" }}><ImageIcon className="size-4" /> Content</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/accommodation/accommodations/$id/edit" params={{ id: a.id }}><Pencil className="size-4" /> Edit</Link>
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
