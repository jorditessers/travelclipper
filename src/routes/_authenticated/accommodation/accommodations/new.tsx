import { createFileRoute } from "@tanstack/react-router";
import { AccommodationWizard } from "@/components/accommodations/AccommodationWizard";

export const Route = createFileRoute("/_authenticated/accommodation/accommodations/new")({
  head: () => ({
    meta: [
      { title: "Add accommodation — Vellum" },
      { name: "description", content: "Add a stay to make it available to distribution partners." },
      { property: "og:title", content: "Add accommodation — Vellum" },
      { property: "og:description", content: "Add a stay to make it available to distribution partners." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AccommodationWizard />,
});
