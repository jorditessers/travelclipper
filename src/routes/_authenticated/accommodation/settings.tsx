import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { PlaceholderPage } from "@/components/app/PlaceholderPage";
import { SettingsPreview } from '@/components/app/SettingsPreview';

export const Route = createFileRoute("/_authenticated/accommodation/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Vellum" },
      { name: "description", content: "Profile, company and preferences." },
      { property: "og:title", content: "Settings — Vellum" },
      { property: "og:description", content: "Profile, company and preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage role="accommodation_partner" title="Settings" description="Profile, company and preferences." icon={Settings} showTable={false}>
      <SettingsPreview />
    </PlaceholderPage>
  );
}
