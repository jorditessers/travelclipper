import { friendlyError } from "@/lib/errors";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/app/ui-kit";

export const trackingUrl = (code: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/go/${code}`;

export function CopyButton({ text, label = "Copy", size = "sm" }: { text: string; label?: string; size?: "sm" | "default" }) {
  const [done, setDone] = useState(false);
  return (
    <Button type="button" variant="outline" size={size} onClick={async () => {
      try {
        await navigator.clipboard.writeText(text);
        setDone(true); toast.success("Copied"); setTimeout(() => setDone(false), 1500);
      } catch { toast.error("Couldn't copy — select and copy manually."); }
    }}>
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {label}
    </Button>
  );
}

type MyLink = { id: string; tracking_code: string; label: string | null; clicks: number; accommodation_id: string; archived_at: string | null; created_at: string };

/**
 * Opens straight onto the partner's own tracking link for this stay: the existing one, or a new
 * unique one created on first open. Extra links per channel (e.g. "Instagram") are optional.
 */
export function TrackingLinkDialog({ accommodationId, trigger }: { accommodationId: string; trigger?: ReactElement }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const autoCreated = useRef(false);

  const links = useQuery({
    queryKey: ["my-links"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_links");
      if (error) throw error;
      return data as MyLink[];
    },
  });
  const mine = (links.data ?? [])
    .filter((l) => l.accommodation_id === accommodationId && !l.archived_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const create = useMutation({
    mutationFn: async (withLabel: string) => {
      const { data, error } = await supabase.rpc("create_distribution_link", { _accommodation_id: accommodationId, _label: withLabel });
      if (error) throw error;
      return data[0]!.tracking_code;
    },
    onSuccess: async (_c, withLabel) => {
      if (withLabel) { toast.success("Link created"); setLabel(""); }
      await qc.invalidateQueries({ queryKey: ["my-links"] });
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  // First open for this stay: create the partner's unique link right away.
  useEffect(() => {
    if (open && links.isSuccess && mine.length === 0 && !autoCreated.current && !create.isPending) {
      autoCreated.current = true;
      create.mutate("");
    }
  }, [open, links.isSuccess, mine.length, create]);

  const main = mine[0];
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLabel(""); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button className="w-full"><Link2 className="size-4" /> Get tracking link</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">Your tracking link</DialogTitle>
          <DialogDescription>Share this link wherever you promote the stay. Every booking through it is credited to you.</DialogDescription>
        </DialogHeader>
        {links.error ? (
          <p className="text-sm text-muted-foreground">We couldn't load your links. Close this window and try again.</p>
        ) : !main ? (
          <div className="rounded-2xl border border-border bg-mist/40 p-4 text-sm text-muted-foreground">
            {create.isError ? "We couldn't create your link. Close this window and try again." : "Creating your unique link…"}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-mist/40 p-2 pl-4">
              <code className="min-w-0 flex-1 truncate text-sm">{trackingUrl(main.tracking_code)}</code>
              <CopyButton text={trackingUrl(main.tracking_code)} label="Copy link" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4">
              <p className="text-sm">Travelers booking by email or phone can mention code <span className="font-mono font-medium">{main.tracking_code}</span>.</p>
              <CopyButton text={main.tracking_code} label="Copy code" />
            </div>
            {mine.length > 1 && (
              <div className="space-y-2">
                <p className="eyebrow">Your other links for this stay</p>
                {mine.slice(1).map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-xl border border-border p-2 pl-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{l.label || l.tracking_code} <span className="text-muted-foreground">· {l.clicks} {l.clicks === 1 ? "click" : "clicks"}</span></span>
                    <CopyButton text={trackingUrl(l.tracking_code)} label="Copy" />
                  </div>
                ))}
              </div>
            )}
            <form className="space-y-3 border-t pt-4" onSubmit={(e) => { e.preventDefault(); if (label.trim()) create.mutate(label.trim()); }}>
              <Field label="Extra link for one channel (optional)" hint='For example "Instagram" or "Newsletter May", so you can see which channel brings clicks. Only you see this.'>
                <TextInput maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Instagram" />
              </Field>
              <Button type="submit" variant="outline" className="w-full" disabled={!label.trim() || create.isPending}>
                {create.isPending ? "Creating…" : "Create extra link"}
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
