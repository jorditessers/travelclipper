import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Pencil } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { ContentLibrary } from "@/components/accommodations/ContentLibrary";
import { CommissionSettings } from "@/components/accommodations/CommissionSettings";
import { PublishPanel } from "@/components/accommodations/PublishPanel";
import {
  ACCOMMODATION_STATUS_LABEL, accommodationTypeLabel, marketLabel, nicheLabel,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const search = z.object({ tab: z.enum(["details", "content", "commission"]).optional() });

export const Route = createFileRoute("/_authenticated/accommodation/accommodations/$id/")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Accommodation — Vellum" },
      { name: "description", content: "Details and content library for your stay." },
      { property: "og:title", content: "Accommodation — Vellum" },
      { property: "og:description", content: "Details and content library for your stay." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { tab = "details" } = Route.useSearch();
  const q = useQuery({
    queryKey: ["accommodation", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accommodations").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;
  if (q.error) return <EmptyState icon={Building2} title="Couldn't load this accommodation" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />;
  const a = q.data;
  if (!a) return <EmptyState icon={Building2} title="Accommodation not found" description="It may have been deleted." />;

  const tabs = [
    { key: "details", label: "Details" },
    { key: "content", label: "Content" },
    { key: "commission", label: "Commission" },
  ] as const;

  return (
    <div className="space-y-8">
      <Link to="/accommodation/accommodations" className="text-sm text-ink/60 hover:text-ink">← Accommodations</Link>
      <PageHeader
        eyebrow={[accommodationTypeLabel(a.accommodation_type), a.city].filter(Boolean).join(" · ") || "Accommodation"}
        title={a.name}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={a.status === "active" ? "moss" : a.status === "pending_review" ? "clay" : "neutral"}>{ACCOMMODATION_STATUS_LABEL[a.status]}</Badge>
            <Button variant="outline" asChild>
              <Link to="/accommodation/accommodations/$id/edit" params={{ id }}><Pencil className="size-4" /> Edit details</Link>
            </Button>
          </div>
        }
      />
      <PublishPanel accommodation={a} />
      <nav className="flex gap-6 border-b border-border" aria-label="Sections">
        {tabs.map((t) => (
          <Link key={t.key} to="/accommodation/accommodations/$id" params={{ id }} search={{ tab: t.key }}
            className={cn("-mb-px border-b-2 pb-3 text-sm transition", tab === t.key ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "commission" ? <CommissionSettings accommodationId={id} /> : tab === "content" ? <ContentLibrary accommodationId={id} /> : (
        <Card className="grid gap-6 md:grid-cols-2">
          <Detail k="Location" v={[a.city, a.region, a.country && marketLabel(a.country)].filter(Boolean).join(", ")} />
          <Detail k="From" v={a.starting_price_per_night ? `€${Number(a.starting_price_per_night).toFixed(2)} / night` : ""} />
          <Detail k="Guests · bedrooms · bathrooms" v={`${a.max_guests ?? "–"} · ${a.bedrooms ?? "–"} · ${a.bathrooms ?? "–"}`} />
          <Detail k="Niches" v={a.niches.map(nicheLabel).join(", ")} />
          <Detail k="Short description" v={a.short_description ?? ""} />
          <Detail k="Best suited for" v={a.best_suited_for.join(", ")} />
          <Detail k="Website" v={a.website_url ?? ""} />
          <Detail k="Direct booking" v={a.booking_url ?? ""} />
        </Card>
      )}
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="eyebrow">{k}</p>
      <p className="mt-1 break-words text-sm">{v || <span className="text-ink/40">—</span>}</p>
    </div>
  );
}
