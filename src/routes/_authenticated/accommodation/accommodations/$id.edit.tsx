import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccommodationWizard } from "@/components/accommodations/AccommodationWizard";
import { EmptyState, Skeleton } from "@/components/app/ui-kit";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/accommodation/accommodations/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit accommodation — Vellum" },
      { name: "description", content: "Update your stay's details." },
      { property: "og:title", content: "Edit accommodation — Vellum" },
      { property: "og:description", content: "Update your stay's details." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["accommodation", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("accommodations").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;
  if (q.error) return <EmptyState icon={Building2} title="Couldn't load this accommodation" description="We couldn't load this right now. Check your connection and try again." />;
  if (!q.data) return <EmptyState icon={Building2} title="Accommodation not found" description="It may have been deleted." />;
  return <AccommodationWizard key={q.data.id} initial={q.data} />;
}
