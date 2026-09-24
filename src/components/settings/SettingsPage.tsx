import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Skeleton } from "@/components/app/ui-kit";
import { ROLE_LABEL } from "@/components/app/nav";
import { billingComplete } from "@/lib/billing";
import { LOAD_ERROR_HINT } from "@/lib/errors";
import { AccountSection } from "./AccountSection";
import { ApProfileSection } from "./ApProfileSection";
import { BillingSection } from "./BillingSection";
import { DpProfileSection } from "./DpProfileSection";
import { useIsDemoSession, useMySettings } from "./shared";

type Role = "accommodation_partner" | "distribution_partner";

export function SettingsPage({ role }: { role: Role }) {
  const q = useMySettings(role);
  const demo = useIsDemoSession();
  const d = q.data;

  return (
    <div className="space-y-8 fade-up">
      <PageHeader eyebrow={ROLE_LABEL[role]} title="Settings"
        description={role === "accommodation_partner" ? "Your profile, invoicing details and account." : "Your partner profile, payout details and account."}
        actions={demo ? <Badge tone="clay">Read-only in demo mode</Badge> : undefined} />

      {q.isLoading ? (
        <div className="space-y-6"><Skeleton className="h-96" /><Skeleton className="h-80" /><Skeleton className="h-48" /></div>
      ) : q.error || !d ? (
        <EmptyState icon={Settings} title="Couldn't load your settings" description={LOAD_ERROR_HINT}
          action={<Button variant="outline" onClick={() => q.refetch()}>Retry</Button>} />
      ) : (
        <>
          {!demo && !billingComplete(d.billing, role === "distribution_partner") && (
            <a href="#billing" className="block rounded-2xl border border-clay/30 bg-clay/10 px-5 py-4 text-sm text-clay transition hover:bg-clay/15">
              {role === "distribution_partner"
                ? "Add your payout details so we can pay the commission you earn. →"
                : "Add your invoicing details so we can invoice commission correctly. →"}
            </a>
          )}
          {role === "accommodation_partner" && d.ap && <ApProfileSection profile={d.profile} ap={d.ap} readOnly={demo} />}
          {role === "distribution_partner" && d.dp && <DpProfileSection profile={d.profile} dp={d.dp} readOnly={demo} />}
          <BillingSection role={role} billing={d.billing} readOnly={demo} />
          <AccountSection email={d.email} readOnly={demo} />
        </>
      )}
    </div>
  );
}
