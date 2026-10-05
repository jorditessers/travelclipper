// Server only: builds and sends the transactional emails queued in email_outbox.
// Load with a dynamic import inside server handlers (see email.functions.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEGAL_ENTITY } from "@/lib/legal";
import type { Database } from "@/integrations/supabase/types";

type OutboxRow = Database["public"]["Tables"]["email_outbox"]["Row"];
type Email = { to: string[]; subject: string; html: string; text: string };

const siteUrl = () => (process.env["SITE_URL"] ?? "https://www.holidayclippers.com").replace(/\/+$/, "");
const fromAddress = () => process.env["EMAIL_FROM"] ?? "Holiday Clippers <hello@holidayclippers.com>";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** One branded layout for every email: heading, paragraphs, optional button. Inputs are plain text. */
export function layout(o: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string }): { html: string; text: string } {
  const p = o.paragraphs.map((t) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4a453f">${esc(t).replace(/\n/g, "<br>")}</p>`).join("");
  const btn = o.button
    ? `<p style="margin:28px 0"><a href="${esc(o.button.url)}" style="display:inline-block;background:#2a2621;color:#f4f0e6;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:15px">${esc(o.button.label)}</a></p>`
    : "";
  const foot = o.footnote ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a847b">${esc(o.footnote)}</p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f0e6;font-family:Inter,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0e6;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf9f4;border-radius:20px;padding:36px 32px">
<tr><td>
<p style="margin:0 0 28px;font-family:Georgia,serif;font-size:20px;color:#3b694c">Holiday Clippers</p>
<h1 style="margin:0 0 20px;font-family:Georgia,serif;font-weight:normal;font-size:28px;line-height:1.2;color:#2a2621">${esc(o.heading)}</h1>
${p}${btn}${foot}
</td></tr></table>
<p style="margin:20px 0 0;font-size:12px;color:#8a847b">${esc(LEGAL_ENTITY.platformName)} · <a href="${esc(siteUrl())}" style="color:#8a847b">${esc(siteUrl().replace(/^https?:\/\//, ""))}</a> · Questions? Just reply to this email.</p>
</td></tr></table></body></html>`;
  const text = [o.heading, "", ...o.paragraphs.flatMap((t) => [t, ""]), ...(o.button ? [`${o.button.label}: ${o.button.url}`, ""] : []), ...(o.footnote ? [o.footnote] : [])].join("\n");
  return { html, text };
}

async function userInfo(userId: string) {
  const [{ data: profile }, { data: role }] = await Promise.all([
    supabaseAdmin.from("profiles").select("email, first_name, last_name, company_name").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
  ]);
  let email = profile?.email ?? null;
  if (!email) email = (await supabaseAdmin.auth.admin.getUserById(userId)).data.user?.email ?? null;
  return { email, firstName: profile?.first_name?.trim() || null, name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null, company: profile?.company_name ?? null, role: role?.role ?? null };
}

async function adminEmails(): Promise<string[]> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (roles ?? []).map((r) => r.user_id);
  const { data: profiles } = ids.length ? await supabaseAdmin.from("profiles").select("email").in("id", ids) : { data: [] };
  const extra = (process.env["ADMIN_NOTIFY_EMAIL"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...(profiles ?? []).map((p) => p.email).filter((e): e is string => !!e), ...extra])];
}

/** The emails one outbox row stands for (the user's email, plus a heads-up to the admins where useful). */
async function buildEmails(row: OutboxRow): Promise<Email[]> {
  const u = await userInfo(row.user_id);
  if (!u.email) throw new Error("User has no email address");
  const hi = u.firstName ? `Hi ${u.firstName},` : "Hi,";
  const site = siteUrl();
  const out: Email[] = [];
  const push = (to: string[], subject: string, body: Parameters<typeof layout>[0]) => {
    if (to.length) out.push({ to, subject, ...layout(body) });
  };

  if (row.kind === "welcome") {
    if (u.role === "accommodation_partner") {
      push([u.email], "Welcome to Holiday Clippers", {
        heading: "Your account is ready",
        paragraphs: [
          hi,
          "Thanks for joining Holiday Clippers. Your accommodation partner account is set up.",
          "Next step: add your first stay with photos, a description and your commission. When it's complete, submit it for review. We check every stay personally before distribution partners can see it, and we'll email you as soon as it's live.",
        ],
        button: { label: "Add your first stay", url: `${site}/accommodation/accommodations` },
      });
    } else {
      push([u.email], "Welcome to Holiday Clippers", {
        heading: "Your account is ready",
        paragraphs: [
          hi,
          "Thanks for joining Holiday Clippers. Your distribution partner account is set up.",
          "Browse the stays, save the ones that suit your audience and create a tracking link to share. Every booking that comes through your link earns you commission. Add your payout details in Settings so we can pay you out.",
        ],
        button: { label: "Browse stays", url: `${site}/distribution/discover` },
      });
    }
    const who = [u.name, u.company].filter(Boolean).join(" · ") || u.email;
    push(await adminEmails(), `New ${u.role === "accommodation_partner" ? "accommodation" : "distribution"} partner: ${who}`, {
      heading: "A new partner joined",
      paragraphs: [`${who} (${u.email}) just finished signing up as ${u.role === "accommodation_partner" ? "an accommodation partner" : "a distribution partner"}.`],
      button: { label: "View in admin", url: `${site}/admin/users` },
    });
    return out;
  }

  if (row.kind === "payout_details_changed") {
    push([u.email], "Your payout details were changed", {
      heading: "Your bank details were changed",
      paragraphs: [
        hi,
        "The bank account for your Holiday Clippers payouts was just changed. Future commission will be paid to the new account.",
        "Was this you? Then there's nothing you need to do. If you didn't make this change, reply to this email straight away and change your password.",
      ],
      button: { label: "Check your settings", url: `${site}/distribution/settings` },
    });
    return out;
  }

  if (row.kind.startsWith("booking_")) {
    const { data: b } = await supabaseAdmin.from("bookings")
      .select("id, accommodation_id, partner_id, check_in, check_out, guests, booking_value, partner_commission, accommodations(name, currency, owner_id)")
      .eq("id", row.booking_id ?? "").maybeSingle();
    if (!b) throw new Error("Booking not found");
    const stay = (b.accommodations as { name: string; currency: string } | null) ?? { name: "your stay", currency: "EUR" };
    const money = (n: number | null) =>
      n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: stay.currency || "EUR" }).format(Number(n));
    const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    const nights = Math.max(1, Math.round((Date.parse(b.check_out) - Date.parse(b.check_in)) / 86_400_000));
    const summary = `${stay.name} · ${date(b.check_in)} – ${date(b.check_out)} (${nights} ${nights === 1 ? "night" : "nights"}, ${b.guests} ${b.guests === 1 ? "guest" : "guests"}) · booking value ${money(b.booking_value)}`;

    if (row.kind === "booking_reported") {
      const { data: dp } = await supabaseAdmin.from("distribution_partner_profiles").select("brand_name").eq("user_id", b.partner_id).maybeSingle();
      const partner = dp?.brand_name ?? "A distribution partner";
      push([u.email], `Please confirm a booking for ${stay.name}`, {
        heading: "A booking is waiting for you",
        paragraphs: [
          hi,
          `${partner} reported a booking that came in through their tracking link:`,
          summary,
          "Please check it against your reservations and confirm or reject it. Commission is only due on bookings you confirm.",
        ],
        button: { label: "Review the booking", url: `${site}/accommodation/bookings` },
      });
      const p = await userInfo(b.partner_id);
      if (p.email) push([p.email], `Booking reported: ${stay.name}`, {
        heading: "Thanks, we've passed it on",
        paragraphs: [
          p.firstName ? `Hi ${p.firstName},` : "Hi,",
          "Your booking has been sent to the accommodation to confirm:",
          summary,
          "You'll get an email as soon as it's confirmed, with the commission you earn.",
        ],
        button: { label: "View your bookings", url: `${site}/distribution/bookings` },
      });
    } else if (row.kind === "booking_confirmed") {
      push([u.email], `Booking confirmed: you earn ${money(b.partner_commission)}`, {
        heading: "Your booking is confirmed",
        paragraphs: [
          hi,
          `Great news: a booking through your link was confirmed.`,
          summary,
          `Your commission: ${money(b.partner_commission)}. It becomes final once the guests have checked out, and is paid out to the bank account in your settings.`,
        ],
        button: { label: "View your earnings", url: `${site}/distribution/bookings` },
      });
    } else if (row.kind === "booking_rejected") {
      push([u.email], `Booking not confirmed: ${stay.name}`, {
        heading: "This booking wasn't confirmed",
        paragraphs: [
          hi,
          "The accommodation couldn't match this booking to a reservation:",
          summary,
          `Reason: ${row.note?.trim() || "no reason given"}`,
          "Think this is a mistake? Reply to this email and we'll look into it with you.",
        ],
        button: { label: "View your bookings", url: `${site}/distribution/bookings` },
      });
    } else if (row.kind === "booking_cancelled") {
      push([u.email], `Booking cancelled: ${stay.name}`, {
        heading: "A booking was cancelled",
        paragraphs: [
          hi,
          "This booking was cancelled, so no commission is due for it:",
          summary,
          ...(row.note?.trim() ? [`Reason: ${row.note.trim()}`] : []),
          "Questions? Reply to this email and we'll help.",
        ],
        button: { label: "View your bookings", url: `${site}/distribution/bookings` },
      });
    }
    return out;
  }

  const { data: acc } = await supabaseAdmin.from("accommodations").select("id, name").eq("id", row.accommodation_id ?? "").maybeSingle();
  if (!acc) throw new Error("Accommodation not found");
  const stayUrl = `${site}/accommodation/accommodations/${acc.id}`;

  if (row.kind === "accommodation_submitted") {
    push([u.email], `We've received ${acc.name}`, {
      heading: "Your stay is in review",
      paragraphs: [
        hi,
        `Thanks for submitting ${acc.name}. It's now pending review.`,
        "We check every stay before it goes live, to keep the quality high for distribution partners. You'll get an email as soon as it's approved, or if we need anything else from you.",
      ],
      button: { label: "View your stay", url: stayUrl },
    });
    push(await adminEmails(), `New stay to review: ${acc.name}`, {
      heading: "A stay is waiting for review",
      paragraphs: [`${[u.name, u.company].filter(Boolean).join(" · ") || u.email} submitted ${acc.name} for review.`],
      button: { label: "Open the review queue", url: `${site}/admin/review` },
    });
  } else if (row.kind === "accommodation_approved") {
    push([u.email], `${acc.name} is live on Holiday Clippers`, {
      heading: "Your stay is approved",
      paragraphs: [
        hi,
        `Good news: ${acc.name} is approved and live. Distribution partners can now find it, share it with their audience and send you bookings.`,
        "Keep your photos, prices and availability up to date so partners can promote it with confidence.",
      ],
      button: { label: "View your stay", url: stayUrl },
    });
  } else if (row.kind === "accommodation_changes_requested") {
    push([u.email], `${acc.name}: a few changes needed`, {
      heading: "A few changes before we can approve",
      paragraphs: [
        hi,
        `Thanks for submitting ${acc.name}. Before we can approve it, we'd like you to look at the following:`,
        row.note?.trim() || "Please check your listing and submit it again.",
        "Update your stay and submit it for review again. We'll take another look straight away.",
      ],
      button: { label: "Edit your stay", url: stayUrl },
    });
  }
  return out;
}

async function send(e: Email, key: string) {
  for (const to of e.to) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: [to], reply_to: LEGAL_ENTITY.email, subject: e.subject, html: e.html, text: e.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Sends every email that is due. Safe to call often and from several places at once. */
export async function flushOutbox(): Promise<{ sent: number; failed: number; configured: boolean }> {
  const key = process.env["RESEND_API_KEY"];
  if (!key || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) return { sent: 0, failed: 0, configured: false };
  const { data: rows, error } = await supabaseAdmin.rpc("claim_email_outbox", { _limit: 20 });
  if (error) throw new Error(`Couldn't read the email outbox: ${error.message}`);
  let sent = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    try {
      for (const e of await buildEmails(row)) await send(e, key);
      await supabaseAdmin.from("email_outbox").update({ sent_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      sent++;
    } catch (err) {
      failed++;
      console.error("[email] failed", row.kind, row.id, err);
      await supabaseAdmin.from("email_outbox").update({ last_error: String((err as Error).message ?? err).slice(0, 500) }).eq("id", row.id);
    }
  }
  return { sent, failed, configured: true };
}
