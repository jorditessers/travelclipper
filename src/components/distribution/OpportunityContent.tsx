import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, ImageIcon, Info, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card, EmptyState, Skeleton } from "@/components/app/ui-kit";
import { ASSET_BUCKET, SIGNED_URL_TTL, assetTypeLabel, kindOfPath, type AssetType } from "@/lib/assets";
import { cn } from "@/lib/utils";

const FILTERS: { key: string; label: string; types: AssetType[] | null }[] = [
  { key: "all", label: "All", types: null },
  { key: "photo", label: "Photos", types: ["photo"] },
  { key: "video", label: "Videos", types: ["video"] },
  { key: "vertical_video", label: "Vertical video", types: ["vertical_video"] },
  { key: "drone", label: "Drone", types: ["drone"] },
  { key: "brand_asset", label: "Brand assets", types: ["brand_asset"] },
  { key: "document", label: "Documents", types: ["document"] },
];

type Item = { id: string; title: string; asset_type: AssetType; storage_path: string | null; external_url: string | null; url: string | null; kind: "image" | "video" | "pdf" };

export function OpportunityContent({ accommodationId, name, terms, approvalRequired }: {
  accommodationId: string; name: string; terms: string | null; approvalRequired: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<Item | null>(null);
  const [zipping, setZipping] = useState(false);

  useEffect(() => {
    const k = `vellum.content_viewed.${accommodationId}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
    supabase.rpc("log_event", { _event_type: "content_viewed", _accommodation_id: accommodationId }).then(() => {});
  }, [accommodationId]);

  const q = useQuery({
    queryKey: ["opportunity-content", accommodationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodation_assets")
        .select("id, title, asset_type, storage_path, external_url, sort_order")
        .eq("accommodation_id", accommodationId)
        .eq("approved_for_distribution", true)
        .order("sort_order");
      if (error) throw error;
      const paths = data.map((a) => a.storage_path).filter(Boolean) as string[];
      const signed: Record<string, string> = {};
      if (paths.length) {
        const { data: s } = await supabase.storage.from(ASSET_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
        s?.forEach((x) => { if (x.path && x.signedUrl) signed[x.path] = x.signedUrl; });
      }
      return data.map((a): Item => ({
        ...a,
        url: a.storage_path ? signed[a.storage_path] ?? null : a.external_url,
        kind: a.storage_path ? (kindOfPath(a.storage_path) ?? "image") : "image",
      }));
    },
  });

  const download = async (a: Item) => {
    try {
      let url = a.external_url;
      if (a.storage_path) {
        const ext = a.storage_path.split(".").pop();
        const { data, error } = await supabase.storage.from(ASSET_BUCKET)
          .createSignedUrl(a.storage_path, 300, { download: `${(a.title || name).replace(/[^\w\- ]+/g, "")}.${ext}` });
        if (error) throw error;
        url = data.signedUrl;
      }
      if (!url) throw new Error("File unavailable");
      await supabase.rpc("log_event", { _event_type: "content_downloaded", _accommodation_id: accommodationId, _metadata: { asset_id: a.id } });
      window.open(url, "_blank", "noopener");
      toast.success("Download started");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const downloadAll = async () => {
    setZipping(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/opportunities/${accommodationId}/photos-zip`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error((await res.text()) || "Download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-photos.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Photos downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setZipping(false);
    }
  };

  const active = FILTERS.find((f) => f.key === filter)!;
  const items = (q.data ?? []).filter((a) => !active.types || active.types.includes(a.asset_type));
  const photoCount = (q.data ?? []).filter((a) => a.asset_type === "photo" || a.asset_type === "drone").length;

  return (
    <div className="space-y-6">
      {approvalRequired && (
        <div className="flex gap-3 rounded-2xl border border-clay/30 bg-clay/5 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-clay" />
          <p className="font-medium">Check with the property before publishing new content.</p>
        </div>
      )}
      <Card>
        <p className="eyebrow">Content usage terms</p>
        <p className="mt-1.5 whitespace-pre-line text-sm">{terms || "No specific usage terms. Use approved content respectfully and credit the accommodation."}</p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={cn("rounded-full border px-3 py-1.5 text-[12px] transition", filter === f.key ? "border-ink bg-ink text-paper" : "border-border hover:border-ink/30")}>
              {f.label}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={downloadAll} disabled={zipping || photoCount === 0}>
          <Download className="size-4" /> {zipping ? "Preparing zip…" : "Download all photos"}
        </Button>
      </div>

      {q.isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60" />)}</div>}
      {q.error && <EmptyState icon={ImageIcon} title="Couldn't load content" description="We couldn't load this right now. Check your connection and try again."
        action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />}
      {q.data && items.length === 0 && <EmptyState icon={ImageIcon} title="No content in this category" description="Try another filter." />}
      {items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="overflow-hidden p-0">
                <button type="button" onClick={() => a.kind !== "pdf" && setOpen(a)} className="relative block aspect-[4/3] w-full bg-mist" aria-label={`Preview ${a.title || "asset"}`}>
                  {a.kind === "image" && a.url && <img src={a.url} alt={a.title} loading="lazy" className="size-full object-cover" />}
                  {a.kind === "video" && a.url && (
                    <>
                      <video src={a.url} muted preload="metadata" className="size-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center"><span className="grid size-12 place-items-center rounded-full bg-paper/90"><Play className="size-5" /></span></span>
                    </>
                  )}
                  {a.kind === "pdf" && <span className="grid size-full place-items-center"><FileText className="size-10 text-ink/40" /></span>}
                </button>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title || "Untitled"}</p>
                    <p className="text-[12px] text-muted-foreground">{assetTypeLabel(a.asset_type)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => download(a)}><Download className="size-3.5" /> Download</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-5xl border-0 bg-ink p-2">
          <DialogTitle className="sr-only">{open?.title || "Preview"}</DialogTitle>
          {open?.kind === "image" && open.url && <img src={open.url} alt={open.title} className="max-h-[80vh] w-full rounded-lg object-contain" />}
          {open?.kind === "video" && open.url && <video src={open.url} controls autoPlay className="max-h-[80vh] w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
