import { ConfirmAction } from "@/components/app/ConfirmAction";
import { friendlyError } from "@/lib/errors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/app/ui-kit";
import type { Accommodation } from "@/lib/constants";

const LABELS: Record<string, string> = {
  details: "Complete all required details",
  commission: "Set your distribution commission",
  cover: "Choose a cover image",
  photos: "Make at least 3 photos available to partners",
};

export function PublishPanel({ accommodation: a }: { accommodation: Accommodation }) {
  const qc = useQueryClient();
  const blockers = useQuery({
    queryKey: ["submission-blockers", a.id],
    enabled: a.status === "draft",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("accommodation_submission_blockers", { _accommodation_id: a.id });
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["accommodation", a.id] });
    qc.invalidateQueries({ queryKey: ["my-accommodations"] });
  };
  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("submit_accommodation_for_review", { _accommodation_id: a.id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Submitted for review"); refresh(); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  const setStatus = useMutation({
    mutationFn: async (status: "active" | "paused") => {
      const { error } = await supabase.from("accommodations").update({ status }).eq("id", a.id);
      if (error) throw error;
      return status;
    },
    onSuccess: (s) => { toast.success(s === "paused" ? "Accommodation paused" : "Accommodation reactivated"); refresh(); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });

  return (
    <Card className="space-y-4">
      {a.review_note && a.status === "draft" && (
        <div className="rounded-xl border border-clay/30 bg-clay/5 p-4 text-sm">
          <p className="eyebrow text-clay">Changes requested</p>
          <p className="mt-1">{a.review_note}</p>
        </div>
      )}
      {a.status === "draft" && (
        blockers.isLoading ? <Skeleton className="h-20" /> : blockers.error ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-destructive">Couldn't check readiness.</span>
            <Button variant="outline" size="sm" onClick={() => blockers.refetch()}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h3 className="font-display text-xl">Ready to publish?</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.keys(LABELS).map((k) => {
                  const missing = blockers.data!.includes(k);
                  return (
                    <li key={k} className={missing ? "text-ink/60" : "text-moss"}>
                      {missing ? <X className="mr-1.5 inline size-3.5" /> : <Check className="mr-1.5 inline size-3.5" />}
                      {LABELS[k]}
                    </li>
                  );
                })}
              </ul>
            </div>
            <Button onClick={() => submit.mutate()} disabled={blockers.data!.length > 0 || submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        )
      )}
      {a.status === "pending_review" && (
        <p className="text-sm"><span className="font-medium">Under review.</span> We'll check your stay shortly — you'll see the result here.</p>
      )}
      {(a.status === "active" || a.status === "paused") && (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm">
            {a.status === "active" ? "Live for distribution partners." : "Paused — hidden from distribution partners."}
          </p>
          {a.status === "active" ? (
            <ConfirmAction title="Pause this stay?" description="It will be hidden from Distribution Partners and existing tracking links will stop earning commission until you reactivate it."
              confirmLabel="Pause stay" onConfirm={() => setStatus.mutate("paused")}
              trigger={<Button variant="outline" disabled={setStatus.isPending}>Pause</Button>} />
          ) : (
            <Button variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate("active")}>Reactivate</Button>
          )}
        </div>
      )}
    </Card>
  );
}
