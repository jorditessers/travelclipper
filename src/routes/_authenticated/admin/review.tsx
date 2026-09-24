import { friendlyError } from "@/lib/errors";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { ASSET_BUCKET, SIGNED_URL_TTL } from "@/lib/assets";
import { accommodationTypeLabel, marketLabel } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/admin/review")({
  head: () => ({
    meta: [
      { title: "Review queue — Vellum" },
      { name: "description", content: "Accommodations waiting for approval." },
      { property: "og:title", content: "Review queue — Vellum" },
      { property: "og:description", content: "Accommodations waiting for approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const q = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodations")
        .select("*, accommodation_assets(storage_path, external_url, is_cover), accommodation_distribution_settings(commission_pool_pct)")
        .eq("status", "pending_review")
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return Promise.all(data.map(async (a) => {
        const cover = a.accommodation_assets.find((x) => x.is_cover);
        let url = cover?.external_url ?? null;
        if (cover?.storage_path) {
          const { data: s } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(cover.storage_path, SIGNED_URL_TTL);
          url = s?.signedUrl ?? null;
        }
        return { ...a, coverUrl: url };
      }));
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Review queue" description="Accommodations waiting for approval." />
      {q.isLoading && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}</div>}
      {q.error && <EmptyState icon={ClipboardCheck} title="Couldn't load the queue" description="We couldn't load this right now. Check your connection and try again."
        action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />}
      {q.data?.length === 0 && <EmptyState icon={ClipboardCheck} title="Nothing to review" description="New submissions will appear here." />}
      <ul className="space-y-4">
        {q.data?.map((a) => <ReviewItem key={a.id} a={a} />)}
      </ul>
    </div>
  );
}


function ReviewItem({ a }: { a: any }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: async (approve: boolean) => {
      const { error } = await supabase.rpc("review_accommodation", { _accommodation_id: a.id, _approve: approve, _note: approve ? "" : note });
      if (error) throw error;
      return approve;
    },
    onSuccess: (ok) => { toast.success(ok ? "Approved — now active" : "Rejected — returned to draft"); qc.invalidateQueries({ queryKey: ["review-queue"] }); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  return (
    <li>
      <Card className="flex flex-col gap-5 p-5 md:flex-row">
        <div className="aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-mist md:w-56">
          {a.coverUrl && <img src={a.coverUrl} alt={a.name} className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="eyebrow">{[accommodationTypeLabel(a.accommodation_type), [a.city, a.country && marketLabel(a.country)].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
          <h3 className="font-display text-2xl">{a.name}</h3>
          <p className="text-sm text-muted-foreground">{a.short_description}</p>
          <p className="text-sm">Commission pool: <span className="font-medium">{a.accommodation_distribution_settings?.commission_pool_pct ?? "—"}%</span>
            {a.starting_price_per_night && <> · From €{Number(a.starting_price_per_night).toFixed(0)} / night</>}</p>
          {rejecting ? (
            <div className="space-y-2 pt-2">
              <textarea className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should the owner change? They will see this note." />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setRejecting(false)}>Cancel</Button>
                <Button onClick={() => m.mutate(false)} disabled={note.trim().length < 3 || m.isPending}>Reject</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-2">
              <Button onClick={() => m.mutate(true)} disabled={m.isPending}>Approve</Button>
              <Button variant="outline" onClick={() => setRejecting(true)} disabled={m.isPending}>Reject</Button>
            </div>
          )}
        </div>
      </Card>
    </li>
  );
}
