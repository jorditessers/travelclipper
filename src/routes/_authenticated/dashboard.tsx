import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { accessQuery, homeFor } from "@/lib/access";

// Post-login entry point: routes each user to where they belong.
// The redirect happens after mount: throwing a redirect from beforeLoad on a full page load of
// /dashboard (e.g. the email-confirmation link or the demo login) crashed the router.
export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardRedirect,
});

function DashboardRedirect() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    qc.ensureQueryData(accessQuery).then(
      (a) => { if (live) void navigate({ href: homeFor(a), replace: true }); },
      () => { if (live) void navigate({ to: "/auth", replace: true }); },
    );
    return () => { live = false; };
  }, [qc, navigate]);
  return null;
}
