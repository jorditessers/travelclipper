import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/SettingsPage";

export const Route = createFileRoute("/_authenticated/distribution/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Vellum" },
      { name: "description", content: "Your partner profile, payout details and account." },
      { property: "og:title", content: "Settings — Vellum" },
      { property: "og:description", content: "Your partner profile, payout details and account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  return <SettingsPage role="distribution_partner" />;
}
