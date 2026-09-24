import { friendlyError } from "@/lib/errors";
import { useState, type ReactElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export function TrackingLinkDialog({ accommodationId, trigger }: { accommodationId: string; trigger?: ReactElement }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_distribution_link", { _accommodation_id: accommodationId, _label: label });
      if (error) throw error;
      return data[0]!.tracking_code;
    },
    onSuccess: (c) => { setCode(c); toast.success("Tracking link created"); qc.invalidateQueries({ queryKey: ["my-links"] }); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setCode(null); setLabel(""); } }}>
      <DialogTrigger asChild>
        {trigger ?? <Button className="w-full"><Link2 className="size-4" /> Get tracking link</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">{code ? "Your tracking link" : "Get tracking link"}</DialogTitle>
          <DialogDescription>
            {code ? "Share this link wherever you promote the stay." : "Create a link for one channel, so you can see where clicks come from."}
          </DialogDescription>
        </DialogHeader>
        {!code ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label="Label (optional)" hint='For example "Instagram" or "Newsletter May". Only you see this.'>
              <TextInput maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Instagram" />
            </Field>
            <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create link"}</Button>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-mist/40 p-2 pl-4">
              <code className="min-w-0 flex-1 truncate text-sm">{trackingUrl(code)}</code>
              <CopyButton text={trackingUrl(code)} label="Copy link" />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4">
              <p className="text-sm">Travelers booking by email or phone can mention code <span className="font-mono font-medium">{code}</span>.</p>
              <CopyButton text={code} label="Copy code" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
