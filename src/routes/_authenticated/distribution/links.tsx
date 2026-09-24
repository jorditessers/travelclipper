import { ConfirmAction } from "@/components/app/ConfirmAction";
import { friendlyError } from "@/lib/errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { CopyButton, trackingUrl } from "@/components/distribution/TrackingLinkDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/distribution/links")({
  head: () => ({
    meta: [
      { title: "Links — Vellum" },
      { name: "description", content: "Your tracking links and partner code." },
      { property: "og:title", content: "Links — Vellum" },
      { property: "og:description", content: "Your tracking links and partner code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Page() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const q = useQuery({
    queryKey: ["my-links"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_links");
      if (error) throw error;
      return data;
    },
  });
  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("archive_distribution_link", { _link_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Link archived"); qc.invalidateQueries({ queryKey: ["my-links"] }); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  const rows = (q.data ?? []).filter((l) => showArchived || !l.archived_at);
  const archivedCount = (q.data ?? []).filter((l) => l.archived_at).length;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Distribution" title="Links" description="Tracking links you created. Clicks are unique visitors, bots excluded." />
      {q.isLoading ? <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>
        : q.error ? <EmptyState icon={Link2} title="Couldn't load your links" description="We couldn't load this right now. Check your connection and try again."
            action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
        : !q.data?.length ? <EmptyState icon={Link2} title="No tracking links yet" description="Open a stay and choose “Get tracking link” to start."
            action={<Button asChild><Link to="/distribution/discover">Discover stays</Link></Button>} />
        : (
          <div className="space-y-3">
            {archivedCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Show archived ({archivedCount})
              </label>
            )}
            <DataTable
              columns={["Accommodation", "Label", "Code", "Clicks", "Created", ""]}
              empty={<p className="text-sm text-muted-foreground">No active links.</p>}
              rows={rows.map((l) => [
                <div key="a" className={cn(l.archived_at && "opacity-50")}>
                  {l.is_available
                    ? <Link to="/distribution/opportunities/$id" params={{ id: l.accommodation_id }} className="font-medium hover:underline">{l.accommodation_name}</Link>
                    : <span className="font-medium">{l.accommodation_name}</span>}
                  {!l.is_available && <p className="text-[12px] text-muted-foreground">No longer available</p>}
                  {l.archived_at && <p className="text-[12px] text-muted-foreground">Archived</p>}
                </div>,
                <span key="l" className="text-muted-foreground">{l.label || "—"}</span>,
                <span key="c" className="font-mono text-[13px]">{l.tracking_code}</span>,
                <span key="n" className="tabular-nums">{Number(l.clicks).toLocaleString("en-IE")}</span>,
                <span key="d" className="whitespace-nowrap text-muted-foreground">{fmtDate(l.created_at)}</span>,
                <div key="x" className="flex justify-end gap-2">
                  {!l.archived_at && <>
                    <CopyButton text={trackingUrl(l.tracking_code)} />
                    <ConfirmAction title="Archive this link?" description="It will stop redirecting travelers. This can't be undone."
                      confirmLabel="Archive link" onConfirm={() => archive.mutate(l.id)}
                      trigger={<Button size="sm" variant="ghost" disabled={archive.isPending}>Archive</Button>} />
                  </>}
                </div>,
              ])}
            />
          </div>
        )}
    </div>
  );
}
