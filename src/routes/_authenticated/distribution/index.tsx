import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/distribution/")({
  beforeLoad: () => {
    throw redirect({ to: "/distribution/dashboard" });
  },
});
