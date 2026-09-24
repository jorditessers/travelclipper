import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { requireRole } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => requireRole(context.queryClient, "admin"),
  component: () => (
    <AppShell role="admin">
      <Outlet />
    </AppShell>
  ),
});
