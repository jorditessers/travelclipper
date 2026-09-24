import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { AppRole } from "@/lib/constants";
import { ROLE_LABEL } from "./nav";
import { DataTable, EmptyState, KpiCard, PageHeader, Skeleton } from "./ui-kit";

export function PlaceholderPage({
  role,
  title,
  description,
  icon,
  showTable,
  children,
}: {
  role: AppRole;
  title: string;
  description: string;
  icon: LucideIcon;
  showTable?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-10 fade-up">
      <PageHeader eyebrow={ROLE_LABEL[role]} title={title} description={description} />

      {showTable && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Metric" value="—" hint="Coming soon" />
          <KpiCard label="Metric" value="—" hint="Coming soon" />
          <KpiCard label="Metric" value="—" hint="Coming soon" />
          <div className="rounded-2xl border bg-card p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-4 h-8 w-24" />
          </div>
        </div>
      )}

      {children ?? (
        showTable ? (
          <DataTable
            columns={["Name", "Status", "Updated", ""]}
            rows={[]}
            empty={<EmptyState icon={icon} title="Nothing here yet" description="This section will be built in an upcoming step." />}
          />
        ) : (
          <EmptyState icon={icon} title="Nothing here yet" description="This section will be built in an upcoming step." />
        )
      )}
    </div>
  );
}
