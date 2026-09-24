import { ConfirmAction } from "@/components/app/ConfirmAction";
import { friendlyError } from "@/lib/errors";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/app/ui-kit";
import { removeDemoData, seedDemoData } from "@/lib/demo.functions";
import { isLocalDemo } from "@/integrations/demo-backend/mode";

export function DemoDataCard() {
  const qc = useQueryClient();
  const seed = useServerFn(seedDemoData);
  const remove = useServerFn(removeDemoData);
  const seedM = useMutation({
    mutationFn: async () => (isLocalDemo() ? (await import("@/integrations/demo-backend")).localSeedDemo() : seed()),
    onSuccess: (r) => { toast.success(`Demo data ready — ${r.accommodationsCreated} new stays, ${r.users} demo accounts`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  const removeM = useMutation({
    mutationFn: async () => (isLocalDemo() ? (await import("@/integrations/demo-backend")).localRemoveDemo() : remove()),
    onSuccess: (r) => { toast.success(`Demo data removed (${r.usersRemoved} accounts)`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
  const busy = seedM.isPending || removeM.isPending;
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-display text-xl">Demo data</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          12 active stays, 2 accommodation partners and 6 distribution partners on @demo.local. Seeding is safe to repeat; every row is marked as demo.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => seedM.mutate()} disabled={busy}>{seedM.isPending ? "Seeding…" : "Seed demo data"}</Button>
        <ConfirmAction title="Remove demo data?" description="All demo accounts, stays, content, links and bookings will be deleted. Real data is not affected."
          confirmLabel="Remove demo data" onConfirm={() => removeM.mutate()}
          trigger={<Button variant="outline" disabled={busy}>{removeM.isPending ? "Removing…" : "Remove demo data"}</Button>} />
      </div>
    </Card>
  );
}
