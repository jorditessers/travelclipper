import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { requireRole } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/distribution")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, "distribution_partner"),
  component: () => (
    <AppShell role="distribution_partner">
      <Outlet />
    </AppShell>
  ),
});
