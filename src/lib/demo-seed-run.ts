// Demo data seed shared by the server (admin "Seed demo data" with the service-role client) and the
// in-browser demo backend (same code against the local database).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import * as S from "./demo-seed-data";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function runDemoSeed(db: SupabaseClient<Database>, password: string) {
    const ok = <T,>(r: { data: T; error: any }): NonNullable<T> => { if (r.error) throw new Error(r.error.message); return r.data as NonNullable<T>; };

    // Existing demo users by email
    const existing = new Map<string, string>();
    for (let page = 1; page < 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      data.users.forEach((u) => u.email && existing.set(u.email, u.id));
      if (data.users.length < 200) break;
    }
    const ensureUser = async (email: string) => {
      const found = existing.get(email);
      if (found) {
        // keep demo logins in sync with the current DEMO_PASSWORD
        const { error } = await db.auth.admin.updateUserById(found, { password });
        if (error) throw new Error(error.message);
        return found;
      }
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(error.message);
      return data.user.id;
    };

    const owners: Record<string, string> = {};
    for (const p of S.DEMO_ACCOMMODATION_PARTNERS) {
      const id = await ensureUser(p.email);
      owners[p.key] = id;
      ok(await db.from("profiles").upsert({
        id, email: p.email, first_name: p.first, last_name: p.last, display_name: `${p.first} ${p.last}`,
        company_name: p.company, country: p.country, onboarding_completed: true, terms_accepted_at: new Date().toISOString(), is_demo: true,
      }));
      ok(await db.from("user_roles").upsert({ user_id: id, role: "accommodation_partner" }, { onConflict: "user_id" }));
      ok(await db.from("accommodation_partner_profiles").upsert({
        user_id: id, business_type: p.business_type, website: p.website, accommodation_count_band: p.band, goals: p.goals, is_demo: true,
      }));
    }

    const partnerIds: string[] = [];
    for (const p of S.DEMO_DISTRIBUTION_PARTNERS) {
      const id = await ensureUser(p.email);
      partnerIds.push(id);
      ok(await db.from("profiles").upsert({
        id, email: p.email, display_name: p.brand, company_name: p.brand, distribution_type: p.type,
        onboarding_completed: true, terms_accepted_at: new Date().toISOString(), is_demo: true,
      }));
      ok(await db.from("user_roles").upsert({ user_id: id, role: "distribution_partner" }, { onConflict: "user_id" }));
      ok(await db.from("distribution_partner_profiles").upsert({
        user_id: id, distribution_type: p.type, brand_name: p.brand, website: p.website, social_links: p.social,
        markets: p.markets, niches: p.niches, reach_band: p.reach, bio: p.bio, is_demo: true,
      }));
    }

    let created = 0;
    for (const a of S.DEMO_ACCOMMODATIONS) {
      const owner = owners[a.owner]!;
      const found = ok(await db.from("accommodations").select("id").eq("owner_id", owner).eq("name", a.name).eq("is_demo", true).maybeSingle());
      if ((found as any)?.id) continue;
      const acc = ok(await db.from("accommodations").insert({
        owner_id: owner, name: a.name, accommodation_type: a.type, country: a.country, region: a.region, city: a.city,
        max_guests: a.guests, bedrooms: a.bedrooms, bathrooms: a.bathrooms, starting_price_per_night: a.price,
        short_description: a.short, long_description: a.long, niches: a.niches, best_suited_for: a.suited,
        website_url: `https://${a.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "")}.example`,
        booking_url: `https://${a.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "")}.example/book`,
        status: "active", is_demo: true,
      }).select("id").single());
      ok(await db.from("accommodation_distribution_settings").insert({
        accommodation_id: acc.id, commission_pool_pct: a.pool, distribution_enabled: true, target_markets: a.markets,
        content_usage_terms: a.terms, content_approval_required: a.approval, is_demo: true,
      }));
      const rows = ok(await db.from("accommodation_assets").insert(a.photos.map((ph, i) => ({
        accommodation_id: acc.id, asset_type: "photo" as const, external_url: S.demoPhoto(ph),
        title: `${a.name} — ${i + 1}`, approved_for_distribution: true, is_demo: true,
      }))).select("id"));
      ok(await db.from("accommodation_assets").update({ is_cover: true }).eq("id", rows[0]!.id));
      created++;
    }
    // Tracking links + ~60 days of clicks (idempotent: only when no demo links exist yet)
    const { count: linkCount } = await db.from("distribution_links").select("id", { count: "exact", head: true }).eq("is_demo", true);
    let linksCreated = 0;
    if (!linkCount) {
      const accs = ok(await db.from("accommodations").select("id").eq("is_demo", true).eq("status", "active"));
      const labels = ["Instagram", "Newsletter", "Blog post", "YouTube", "Pinterest", "Client emails", null];
      const referrers = ["https://www.instagram.com/", "https://l.facebook.com/", "https://www.pinterest.com/", "https://www.youtube.com/", "https://mail.google.com/", "", ""];
      const agents = [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
      ];
      const bots = ["facebookexternalhit/1.1", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"];
      let seed = 42;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
      const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
      const hex = () => Array.from({ length: 64 }, () => Math.floor(rnd() * 16).toString(16)).join("");
      const now = Date.now();
      for (const [pi, partner] of partnerIds.entries()) {
        const picks = [...accs].sort(() => rnd() - 0.5).slice(0, 3 + (pi % 3));
        for (const acc of picks) {
          const ageDays = 5 + Math.floor(rnd() * 55);
          const createdAt = new Date(now - ageDays * 86400000);
          const link = ok(await db.from("distribution_links").insert({
            partner_id: partner, accommodation_id: acc.id, label: pick(labels), is_demo: true,
            created_at: createdAt.toISOString(),
          } as any).select("id").single());
          linksCreated++;
          const weight = 0.3 + rnd() * 3; // clicks per day
          const clicks: any[] = [];
          const visitors: string[] = [];
          for (let d = ageDays; d >= 0; d--) {
            const decay = d > ageDays - 4 ? 2.5 : 1; // launch spike
            const n = Math.floor(rnd() * weight * 2 * decay);
            for (let k = 0; k < n; k++) {
              const repeat = visitors.length > 0 && rnd() < 0.12;
              const ip = repeat ? visitors[visitors.length - 1]! : hex();
              if (!repeat) visitors.push(ip);
              const bot = rnd() < 0.06;
              clicks.push({
                link_id: link.id, accommodation_id: acc.id, partner_id: partner,
                clicked_at: new Date(now - d * 86400000 - Math.floor(rnd() * 86400000)).toISOString(),
                referrer: pick(referrers), user_agent: bot ? pick(bots) : pick(agents),
                ip_hash: ip, is_unique: !repeat, is_bot: bot, is_demo: true,
              });
            }
          }
          for (let i = 0; i < clicks.length; i += 500) ok(await db.from("distribution_clicks").insert(clicks.slice(i, i + 500)));
        }
      }
    }
    // Bookings: 20 across statuses and partners (idempotent)
    const { count: bookingCount } = await db.from("bookings").select("id", { count: "exact", head: true }).eq("is_demo", true);
    let bookingsCreated = 0;
    if (!bookingCount) {
      const links = ok(await db.from("distribution_links").select("id, partner_id, accommodation_id, tracking_code, accommodations(starting_price_per_night, max_guests)").eq("is_demo", true));
      const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
      const travelers = ["Anna K.", "M. de Vries", "Tom", "S. & J.", "Lucía", "Priya", "B. Schmidt", "Oliver", "E. M.", "Chloé", "Jan", "R. Rossi"];
      // [status, source, bookedDaysAgo, checkInOffset, nights]
      const plan: [string, "partner_reported" | "accommodation_registered", number, number, number][] = [
        ["completed", "accommodation_registered", 58, -40, 5], ["completed", "partner_reported", 52, -30, 7], ["completed", "accommodation_registered", 45, -21, 4],
        ["completed", "partner_reported", 40, -14, 3], ["completed", "accommodation_registered", 35, -9, 6], ["completed", "partner_reported", 30, -6, 2],
        ["confirmed", "accommodation_registered", 25, 10, 5], ["confirmed", "partner_reported", 21, 18, 7], ["confirmed", "accommodation_registered", 18, 25, 4],
        ["confirmed", "partner_reported", 14, 33, 3], ["confirmed", "accommodation_registered", 10, 41, 6], ["confirmed", "partner_reported", 7, 55, 5],
        ["reported", "partner_reported", 4, 20, 4], ["reported", "partner_reported", 2, 38, 7], ["reported", "partner_reported", 1, 62, 3],
        ["cancelled", "accommodation_registered", 33, 12, 5], ["cancelled", "partner_reported", 20, 30, 4],
        ["rejected", "partner_reported", 27, 15, 3], ["rejected", "partner_reported", 12, 44, 2], ["confirmed", "accommodation_registered", 5, 70, 8],
      ];
      for (const [i, [status, source, ago, inOff, nights]] of plan.entries()) {
        const l: any = links[(i * 7) % links.length];
        if (!l) break;
        const price = Number(l.accommodations?.starting_price_per_night ?? 250);
        const guests = Math.max(1, Math.min(l.accommodations?.max_guests ?? 2, 2 + (i % 4)));
        const value = Math.round(price * nights * (1 + (i % 3) * 0.08));
        const initial = status === "reported" || status === "rejected" ? "reported" : "confirmed";
        const b = ok(await db.from("bookings").insert({
          accommodation_id: l.accommodation_id, partner_id: l.partner_id, link_id: l.id, tracking_code: l.tracking_code,
          source, traveler_reference: travelers[i % travelers.length]!, booking_date: day(-ago),
          check_in: day(inOff), check_out: day(inOff + nights), guests, booking_value: value, status: initial as any,
          notes: source === "partner_reported" ? "Booked after reading our feature." : null, is_demo: true,
          created_at: new Date(Date.now() - ago * 86400000).toISOString(),
        }).select("id").single());
        if (status !== initial) {
          ok(await db.from("bookings").update({
            status: status as any,
            rejection_reason: status === "rejected" ? "No matching reservation found in our system." : status === "cancelled" ? "Guest cancelled within the free cancellation period." : null,
          }).eq("id", b.id));
        }
        bookingsCreated++;
      }
    }
    // Guided demo: one AP + one DP login, and the tour stay in its starting state
    ok(await db.from("demo_accounts").upsert([
      { user_id: owners[S.DEMO_TOUR.apKey]!, side: "accommodation" },
      { user_id: partnerIds[0]!, side: "distribution" },
    ]));
    const tour = ok(await db.from("accommodations").select("id").eq("owner_id", owners[S.DEMO_TOUR.apKey]!).eq("name", S.DEMO_TOUR.accommodationName).eq("is_demo", true).single());
    ok(await db.from("platform_settings").update({ demo_tour_accommodation_id: tour.id }).not("id", "is", null));
    ok(await db.rpc("demo_reset_state"));
    return { bookingsCreated, linksCreated, accommodationsCreated: created, users: S.DEMO_ACCOMMODATION_PARTNERS.length + S.DEMO_DISTRIBUTION_PARTNERS.length };
}

export async function runRemoveDemo(db: SupabaseClient<Database>) {
    const del = async (q: PromiseLike<{ error: any }>) => { const { error } = await q; if (error) throw new Error(error.message); };
    await del(db.from("bookings").delete().eq("is_demo", true));
    await del(db.from("distribution_clicks").delete().eq("is_demo", true));
    await del(db.from("distribution_links").delete().eq("is_demo", true));
    await del(db.from("accommodation_assets").delete().eq("is_demo", true));
    await del(db.from("accommodation_distribution_settings").delete().eq("is_demo", true));
    await del(db.from("accommodations").delete().eq("is_demo", true));
    const { data: profs, error } = await db.from("profiles").select("id, email").eq("is_demo", true);
    if (error) throw new Error(error.message);
    const ids = (profs ?? []).filter((p) => p.email?.endsWith("@demo.local")).map((p) => p.id);
    if (ids.length) {
      await del(db.from("accommodation_partner_profiles").delete().in("user_id", ids));
      await del(db.from("distribution_partner_profiles").delete().in("user_id", ids));
      await del(db.from("user_roles").delete().in("user_id", ids));
      await del(db.from("profiles").delete().in("id", ids));
      for (const id of ids) {
        const { error: e } = await db.auth.admin.deleteUser(id);
        if (e) throw new Error(e.message);
      }
    }
    return { usersRemoved: ids.length };
}
