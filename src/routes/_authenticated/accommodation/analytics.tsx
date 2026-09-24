import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PlaceholderPage } from "@/components/app/PlaceholderPage";


export const Route = createFileRoute("/_authenticated/accommodation/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Vellum" },
      { name: "description", content: "Clicks, bookings and partner performance." },
      { property: "og:title", content: "Analytics — Vellum" },
      { property: "og:description", content: "Clicks, bookings and partner performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PlaceholderPage role="accommodation_partner" title="Analytics" description="Clicks, bookings and partner performance." icon={BarChart3} showTable={true}>
    </PlaceholderPage>
  );
}
