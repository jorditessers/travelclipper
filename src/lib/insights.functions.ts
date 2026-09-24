import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const KPI_OPTIONS = [
  { value: "bookings_confirmed", label: "Confirmed bookings" },
  { value: "booking_volume", label: "Booking volume" },
  { value: "platform_revenue", label: "Platform revenue" },
  { value: "unique_clicks", label: "Unique clicks" },
  { value: "links_created", label: "Tracking links created" },
  { value: "accommodations_published", label: "Stays published" },
  { value: "new_accommodations", label: "New stays" },
  { value: "new_users", label: "New users" },
] as const;

const Input = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kpi: z.enum(KPI_OPTIONS.map((k) => k.value) as [string, ...string[]]),
  deviation: z.enum(["drop", "increase", "unexpected"]),
  context: z.string().max(500).optional().default(""),
  excludeDemo: z.boolean().default(true),
});

export type InsightResult =
  | { ok: true; summary: string; metrics: { current: Record<string, string | number | null>; previous: Record<string, string | number | null>; current_period: { from: string; to: string }; previous_period: { from: string; to: string } } }
  | { ok: false; error: string };

export const analyzeKpiDeviation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<InsightResult> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false, error: "Only admins can run this analysis." };

    const { data: metrics, error } = await context.supabase.rpc("admin_period_metrics", { _from: data.from, _to: data.to, _exclude_demo: data.excludeDemo });
    if (error) return { ok: false, error: error.message.includes("at most one year") ? "Choose a period of at most one year." : "We couldn't load the platform numbers for this period. Try again." };

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "AI analysis is not configured yet. Contact support." };

    const kpiLabel = KPI_OPTIONS.find((k) => k.value === data.kpi)!.label;
    const prompt = [
      `You are an analyst for Vellum, a B2B travel distribution platform: accommodations offer commission, Distribution Partners (creators, travel advisors, agencies, curators, publishers, communities) promote them via tracking links and earn commission on confirmed bookings. Travelers are not users. Currency EUR.`,
      `The admin observed an ${data.deviation === "drop" ? "unexpected drop" : data.deviation === "increase" ? "unexpected increase" : "unexpected change"} in the KPI "${kpiLabel}" (${data.kpi}) for ${data.from} to ${data.to}.`,
      data.context ? `Admin notes: ${data.context}` : "",
      `Platform metrics (current period vs. the equally long previous period), JSON:\n${JSON.stringify(metrics)}`,
      `Write in English, max 300 words, plain text with these three headings on their own line: "What changed", "Possible causes", "Suggested next steps".`,
      `Base causes only on the metrics above and the funnel (stays published -> links -> clicks -> bookings -> confirmation). Name the specific numbers. Label causes as hypotheses and say which metric would confirm each. If the data is too thin (e.g. small counts), say so. Next steps must be concrete actions an admin can take in the app or with partners. No markdown tables.`,
    ].filter(Boolean).join("\n\n");

    try {
      const { streamText } = await import("ai");
      const { createOpenAI } = await import("@ai-sdk/openai");
      const lovable = createOpenAI({
        baseURL: "https://ai.gateway.lovable.dev/v1",
        apiKey: key,
        headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      });
      const result = streamText({
        model: lovable.responses("openai/gpt-6-astra"),
        prompt,
        maxRetries: 0,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const summary = (await result.text).trim();
      if (!summary) return { ok: false, error: "The AI returned no summary. Try again with a different period." };
      return { ok: true, summary, metrics: metrics as never };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("AI gateway error", status, e instanceof Error ? e.message : e);
      if (status === 402) return { ok: false, error: "AI credits have run out. Add credits in Settings → Plans & credits, then try again." };
      if (status === 403) return { ok: false, error: "AI use is currently blocked for this workspace (limit or policy). A workspace admin can raise it in workspace settings." };
      if (status === 429) return { ok: false, error: "Too many AI requests right now. Wait a minute and try again." };
      return { ok: false, error: "The AI analysis failed. Try again in a moment." };
    }
  });
