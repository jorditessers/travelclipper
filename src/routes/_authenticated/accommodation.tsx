import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { requireRole } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/accommodation")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, "accommodation_partner"),
  component: () => (
    <AppShell role="accommodation_partner">
      <Outlet />
    </AppShell>
  ),
});
