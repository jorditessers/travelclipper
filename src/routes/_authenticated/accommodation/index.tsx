import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/accommodation/")({
  beforeLoad: () => {
    throw redirect({ to: "/accommodation/dashboard" });
  },
});
