import { friendlyError } from "@/lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText, GripVertical, ImageIcon, Play, Star, Trash2, UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState, NativeSelect, Skeleton } from "@/components/app/ui-kit";
import {
  ACCEPT, ASSET_BUCKET, ASSET_TYPES, defaultAssetType, kindOfPath, signedUrls, uploadWithProgress, validateFile,
  type Asset, type AssetType,
} from "@/lib/assets";
import { cn } from "@/lib/utils";

type Upload = { key: string; name: string; pct: number; error?: string };
type Filter = "all" | AssetType;

export function ContentLibrary({ accommodationId }: { accommodationId: string }) {
  const qc = useQueryClient();
  const key = ["assets", accommodationId];
  const [filter, setFilter] = useState<Filter>("all");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const assets = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accommodation_assets").select("*")
        .eq("accommodation_id", accommodationId)
        .order("sort_order").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const paths = useMemo(() => (assets.data ?? []).map((a) => a.storage_path).filter((p): p is string => !!p).sort(), [assets.data]);
  const urls = useQuery({
    queryKey: ["asset-urls", paths],
    queryFn: () => signedUrls(paths),
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000, // refresh before the 1h signed URL expires
  });
  const srcOf = (a: Asset) => (a.storage_path ? urls.data?.[a.storage_path] : a.external_url) ?? null;

  const invalidate = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["submission-blockers", accommodationId] }); };

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    for (const file of files) {
      const v = validateFile(file);
      if (!v.ok) { toast.error(v.error); continue; }
      const k = crypto.randomUUID();
      const path = `${accommodationId}/${crypto.randomUUID()}.${v.ext}`;
      setUploads((u) => [...u, { key: k, name: file.name, pct: 0 }]);
      const setPct = (pct: number) => setUploads((u) => u.map((x) => (x.key === k ? { ...x, pct } : x)));
      try {
        await uploadWithProgress(path, file, v.mime, setPct);
        const { error } = await supabase.from("accommodation_assets").insert({
          accommodation_id: accommodationId,
          asset_type: defaultAssetType(v.kind),
          storage_path: path,
          title: file.name.replace(/\.[^.]+$/, "").slice(0, 120),
        });
        if (error) {
          await supabase.storage.from(ASSET_BUCKET).remove([path]);
          throw error;
        }
        setUploads((u) => u.filter((x) => x.key !== k));
        await invalidate();
      } catch (e) {
        const msg = friendlyError(e, "Upload failed. Please try again.");
        setUploads((u) => u.map((x) => (x.key === k ? { ...x, error: msg } : x)));
        toast.error(`${file.name}: ${msg}`);
      }
    }
    if (files.length) toast.success("Upload finished");
  }

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<Asset, "title" | "asset_type" | "approved_for_distribution">> }) => {
      const { error } = await supabase.from("accommodation_assets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(friendlyError(e, "Could not update. Please try again.")),
  });
  const cover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("set_asset_cover", { _asset_id: id });
      if (error) throw error;
    },
    onSuccess: async () => { await invalidate(); toast.success("Cover updated"); },
    onError: (e) => toast.error(friendlyError(e, "Could not set cover. Please try again.")),
  });
  const remove = useMutation({
    mutationFn: async (a: Asset) => {
      const { error } = await supabase.from("accommodation_assets").delete().eq("id", a.id);
      if (error) throw error;
      if (a.storage_path) {
        const { error: sErr } = await supabase.storage.from(ASSET_BUCKET).remove([a.storage_path]);
        if (sErr) throw sErr;
      }
    },
    onSuccess: async () => { await invalidate(); toast.success("Asset deleted"); },
    onError: (e) => toast.error(friendlyError(e, "Could not delete. Please try again.")),
  });
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("reorder_assets", { _accommodation_id: accommodationId, _ids: ids });
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Asset[]>(key);
      if (prev) qc.setQueryData(key, ids.map((id) => prev.find((a) => a.id === id)!).filter(Boolean));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(friendlyError(e, "Could not reorder. Please try again."));
    },
    onSettled: invalidate,
  });

  const all = assets.data ?? [];
  const shown = filter === "all" ? all : all.filter((a) => a.asset_type === filter);
  const hasCover = all.some((a) => a.is_cover);
  const approvedPhotos = all.filter((a) => a.asset_type === "photo" && a.approved_for_distribution).length;

  const onDropCard = (targetId: string) => {
    if (!dragId || dragId === targetId || filter !== "all") return;
    const ids = all.map((a) => a.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-6">
      {assets.data && (!hasCover || approvedPhotos < 3) && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-clay/30 bg-clay/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-clay" />
          <div>
            <p className="font-medium">Your content isn't partner-ready yet</p>
            <ul className="mt-1 list-disc pl-4 text-ink/70">
              {!hasCover && <li>Choose a cover image.</li>}
              {approvedPhotos < 3 && <li>Add at least 3 photos available to partners ({approvedPhotos}/3).</li>}
            </ul>
          </div>
        </div>
      )}

      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); } }}
        className={cn("rounded-2xl border border-dashed p-8 text-center transition", dragOver ? "border-moss bg-moss/5" : "border-border bg-paper/60")}
      >
        <UploadCloud className="mx-auto size-6 text-moss" />
        <p className="mt-3 font-display text-lg">Drop photos, videos or documents</p>
        <p className="mt-1 text-[12px] text-muted-foreground">JPG, PNG, WEBP up to 15 MB · MP4, MOV up to 50 MB · PDF up to 10 MB</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => inputRef.current?.click()}>Browse files</Button>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-2">
          {uploads.map((u) => (
            <li key={u.key} className="rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{u.name}</span>
                {u.error ? (
                  <button className="text-[12px] text-ink/50 hover:text-ink" onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}>Dismiss</button>
                ) : (
                  <span className="text-[12px] text-muted-foreground">{u.pct}%</span>
                )}
              </div>
              {u.error ? <p className="mt-1 text-[12px] text-destructive">{u.error}</p> : (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-mist"><div className="h-full bg-moss transition-all" style={{ width: `${u.pct}%` }} /></div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {([{ value: "all", label: "All" }, ...ASSET_TYPES] as { value: Filter; label: string }[]).map((t) => {
          const count = t.value === "all" ? all.length : all.filter((a) => a.asset_type === t.value).length;
          return (
            <button key={t.value} type="button" aria-pressed={filter === t.value} onClick={() => setFilter(t.value)}
              className={cn("rounded-full border px-3 py-1.5 text-[12px] transition",
                filter === t.value ? "border-ink bg-ink text-paper" : "border-border bg-paper/60 text-foreground/70 hover:border-ink/30")}>
              {t.label} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
        {filter === "all" && all.length > 1 && <span className="ml-auto self-center text-[12px] text-muted-foreground">Drag to reorder</span>}
      </div>

      {assets.isLoading && <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>}
      {assets.error && <EmptyState icon={ImageIcon} title="Couldn't load content" description="We couldn't load this right now. Check your connection and try again." action={<Button variant="outline" onClick={() => assets.refetch()}>Retry</Button>} />}
      {assets.data && shown.length === 0 && (
        <EmptyState icon={ImageIcon} title={filter === "all" ? "No content yet" : "Nothing of this type yet"} description="Upload photos, videos and documents partners can use to promote this stay." />
      )}

      {shown.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((a) => {
            const src = srcOf(a);
            const kind = a.storage_path ? kindOfPath(a.storage_path) : "image";
            return (
              <li key={a.id}
                draggable={filter === "all"}
                onDragStart={() => setDragId(a.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                onDrop={(e) => { if (dragId) { e.preventDefault(); onDropCard(a.id); } }}
                className={cn("group overflow-hidden rounded-2xl border border-border bg-card shadow-glass-sm transition", dragId === a.id && "opacity-40")}
              >
                <div className="relative aspect-[4/3] bg-mist">
                  {!src ? <Skeleton className="size-full rounded-none" /> : kind === "image" ? (
                    <img src={src} alt={a.title || "Asset"} loading="lazy" className="size-full object-cover" />
                  ) : kind === "video" ? (
                    <>
                      <video src={src} preload="metadata" muted playsInline className="size-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center"><span className="grid size-10 place-items-center rounded-full bg-paper/80"><Play className="size-4" /></span></span>
                    </>
                  ) : (
                    <a href={src} target="_blank" rel="noreferrer" className="grid size-full place-items-center text-ink/60 hover:text-ink">
                      <FileText className="size-8" />
                    </a>
                  )}
                  {a.is_cover && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] text-paper"><Star className="size-3" /> Cover</span>}
                  {filter === "all" && <GripVertical className="absolute right-2 top-2 size-4 text-paper opacity-0 drop-shadow transition group-hover:opacity-100" />}
                </div>
                <div className="space-y-3 p-3">
                  <input
                    defaultValue={a.title}
                    maxLength={120}
                    aria-label="Title"
                    placeholder="Untitled"
                    onBlur={(e) => { const t = e.target.value.trim(); if (t !== a.title) update.mutate({ id: a.id, patch: { title: t } }); }}
                    className="w-full truncate bg-transparent text-sm font-medium outline-none focus:underline"
                  />
                  <NativeSelect
                    aria-label="Type"
                    value={a.asset_type}
                    onChange={(e) => update.mutate({ id: a.id, patch: { asset_type: e.target.value as AssetType } })}
                    options={ASSET_TYPES.filter((t) => allowedTypes(kind).includes(t.value))}
                    className="h-8 py-0 text-[12px]"
                  />
                  <label className="flex items-center justify-between gap-2 text-[12px]">
                    Available to partners
                    <Switch checked={a.approved_for_distribution}
                      onCheckedChange={(v) => update.mutate({ id: a.id, patch: { approved_for_distribution: v } })} />
                  </label>
                  <div className="flex items-center justify-between">
                    {kind === "image" && !a.is_cover ? (
                      <button type="button" onClick={() => cover.mutate(a.id)} className="text-[12px] text-ink/60 underline underline-offset-2 hover:text-ink">Set as cover</button>
                    ) : <span />}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" aria-label="Delete asset" className="rounded-full p-1.5 text-ink/50 hover:bg-mist hover:text-destructive"><Trash2 className="size-4" /></button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
                          <AlertDialogDescription>The file is permanently removed and partners can no longer use it.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(a)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function allowedTypes(kind: ReturnType<typeof kindOfPath>): AssetType[] {
  if (kind === "video") return ["video", "vertical_video", "drone"];
  if (kind === "pdf") return ["document", "brand_asset"];
  return ["photo", "drone", "brand_asset"];
}
