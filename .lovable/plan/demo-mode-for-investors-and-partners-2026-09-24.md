# Demo mode for investors and partners

## What the user sees
- **Login page**: only when `demo_mode_enabled = true` there are two extra buttons: "View demo as Accommodation Partner" and "View demo as Distribution Partner". They sign in with the seeded demo accounts (Marta Ricci / Casa Serena Villas and Lena Voss / Lena Wanders).
- **Demo bar**: a thin bar at the top in every demo session: "Demo mode · Read-only walkthrough", with the buttons "Switch side" (AP <-> DP), "Restart tour" and "Reset demo".
- **Guided tour**: a step card at the bottom right (step x of 6, short neutral text, "Next", "Skip tour"). It opens the right page, highlights the element and switches accounts itself when the other side is needed:
  1. AP: Distribution Settings of "Masseria Ulivo Bianco" -> set commission pool (e.g. 12%) + calculator (EUR 5,000 -> pool / partner / platform)
  2. AP: Content Library -> approve one pending photo ("available to partners")
  3. DP: Discover, sort "Recommended for you" -> the stay shows up with its reasons
  4. DP: detail page -> "Get tracking link" -> copy
  5. DP reports a booking (prefilled: EUR 3,000, fixed dates) -> switch to AP -> confirm
  6. AP dashboard "Commission owed" and DP dashboard "Confirmed commission" with the same amounts
- **Final screen**: a simple flow `Accommodation -> Platform -> Distribution Partner -> Traveler`, showing the booking value, pool, platform share and partner share of the demo booking, read from the database (not hardcoded). One factual line per node, no marketing copy.

## Rules
- Demo sessions see only `is_demo` data (discover, recommendations, dashboards, bookings, links).
- Demo sessions are read-only. The only writes allowed are the 5 tour actions: set commission for a demo stay, approve a demo asset, create a tracking link, report a booking, confirm a booking. Everything else is blocked in the database with "Not available in demo mode" (and the UI shows a toast).
- "Reset demo" restores the demo dataset to its starting point (commission removed from the tour stay, the asset back to pending, tour links/bookings/clicks/events deleted). Demo accounts only, rate limited to once per 10 seconds.
- Real users never see demo data. Admin "Exclude demo data" stays as it is.

## Technical details
- **DB migration**
  - `platform_settings.demo_mode_enabled boolean default false`; public RPC `get_demo_mode()` (anon, returns only the boolean). Admin toggle via `admin_set_demo_mode(note)` with an audit log entry, and a switch in Admin Settings.
  - `demo_accounts(user_id pk, side)` table (no client grants) + `is_demo_user(uid)` security definer.
  - RESTRICTIVE RLS policies on the relevant tables: `NOT is_demo_user(auth.uid()) OR is_demo = true` for SELECT. For INSERT/UPDATE/DELETE: demo users are blocked except on the tables/columns of the tour actions, and only on `is_demo` rows. New rows created by demo users get `is_demo = true` automatically via a trigger.
  - `reset_demo()` security definer: checks `is_demo_user(auth.uid())` and restores the fixed tour state.
  - `demo_tour_summary()`: returns the amounts of the latest confirmed demo booking for the final screen.
- **Demo sign-in**: server function `startDemoSession({side})` (public, no auth). It checks `demo_mode_enabled`, signs in server-side with `DEMO_PASSWORD` (already a secret) and returns the session tokens; the client calls `supabase.auth.setSession`. The password never reaches the browser. "Switch side" uses the same function. Rate limited per IP hash.
- **Seed**: the seed marks the two demo accounts in `demo_accounts` and puts "Masseria Ulivo Bianco" into the tour starting state (active and published, commission not yet set, one asset pending). Requirement: an admin has run "Seed demo data" once.
- **Frontend**: `DemoBar` + `DemoTour` in the authenticated layout (only when `is_demo_user`), tour step kept in localStorage, target elements marked with `data-tour="..."`. `DemoFlow` visual built with the existing design tokens.
- The 5-minute limit: 6 steps with at most ~2 sentences each; no timer.

## Out of scope / warnings
- No new analytics, no public demo without login, no video or marketing copy.
- The demo accounts share one dataset: two viewers at the same time can see each other's actions. Fine for a guided presentation; separate demo copies per visitor are out of MVP scope.
