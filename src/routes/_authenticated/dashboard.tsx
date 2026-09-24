import { createFileRoute, redirect } from "@tanstack/react-router";
import { accessQuery, homeFor } from "@/lib/access";

// Post-login entry point: routes each user to where they belong.
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async ({ context }) => {
    const a = await context.queryClient.ensureQueryData(accessQuery);
    throw redirect({ href: homeFor(a) });
  },
});
