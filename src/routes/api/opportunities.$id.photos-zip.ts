import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { Zip, ZipPassThrough } from "fflate";
import type { Database } from "@/integrations/supabase/types";

const MAX_PHOTOS = 50;
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/api/opportunities/$id/photos-zip")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });
        if (!UUID.test(params.id)) return new Response("Not found", { status: 404 });
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        // Acts as the signed-in user: table RLS + storage policies decide what is readable.
        const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: u, error: ue } = await sb.auth.getUser(token);
        if (ue || !u.user) return new Response("Unauthorized", { status: 401 });

        const { data: acc } = await sb.from("accommodations").select("name").eq("id", params.id).maybeSingle();
        if (!acc) return new Response("Not found", { status: 404 });
        const { data: assets, error } = await sb
          .from("accommodation_assets")
          .select("id, title, storage_path, external_url, sort_order")
          .eq("accommodation_id", params.id)
          .eq("approved_for_distribution", true)
          .in("asset_type", ["photo", "drone"])
          .order("sort_order")
          .limit(MAX_PHOTOS);
        if (error) return new Response("Could not load photos", { status: 500 });
        if (!assets.length) return new Response("No photos available", { status: 404 });

        await sb.rpc("log_event", {
          _event_type: "content_downloaded", _accommodation_id: params.id,
          _metadata: { kind: "photos_zip", asset_ids: assets.map((a) => a.id) },
        });

        const slug = acc.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photos";
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const zip = new Zip((err, chunk, final) => {
              if (err) return controller.error(err);
              controller.enqueue(chunk);
              if (final) controller.close();
            });
            let i = 0;
            for (const a of assets) {
              i++;
              let url = a.external_url;
              if (a.storage_path) {
                const { data } = await sb.storage.from("accommodation-assets").createSignedUrl(a.storage_path, 300);
                url = data?.signedUrl ?? null;
              }
              if (!url) continue;
              const res = await fetch(url);
              if (!res.ok || !res.body) continue;
              const ext = a.storage_path?.split(".").pop() ?? "jpg";
              const file = new ZipPassThrough(`${String(i).padStart(2, "0")}-${slug}.${ext}`);
              zip.add(file);
              const reader = res.body.getReader();
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                file.push(value);
              }
              file.push(new Uint8Array(0), true);
            }
            zip.end();
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="${slug}-photos.zip"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
