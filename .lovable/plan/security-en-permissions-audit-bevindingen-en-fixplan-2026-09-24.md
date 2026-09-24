# Security- en permissions-audit — bevindingen en fixplan

Geen edge functions in het project: tracking (`/go/[code]`) en zip-download zijn eigen server-endpoints en zijn als zodanig meegenomen.
Methode: alle RLS-policies, grants, security definer-functies, triggers, storage-policies, server-endpoints en frontend-code gecontroleerd, plus database-linter en dependency-scan.

## Resultaat per controlepunt

| # | Controle | Uitkomst |
|---|---|---|
| 1 | Rol-escalatie | OK. `user_roles`: alleen SELECT eigen rij, geen client-grants voor insert/update/delete; `choose_role` weigert admin en tweede keuze. |
| 2 | AP A vs AP B | OK voor lezen/wijzigen (alles via `owner_id = auth.uid()` / `can_manage_accommodation`). Wel probleem F1 (verwijderen). |
| 3 | DP A vs DP B | OK. Links/clicks alleen `partner_id = auth.uid()`; bookings/earnings alleen via eigen-data RPC's. |
| 4 | Alleen distributable + approved | OK. Tabel- en storage-policies gebruiken `is_distributable()` + `approved_for_distribution`; bucket privé. |
| 5 | Geen bevestiging/bedragen door DP | OK. Geen DP-schrijfrechten op bookings; commissie wordt altijd door trigger berekend. |
| 6 | Geen naam/e-mail DP voor AP | OK. AP ziet alleen `get_partner_public_profile` en brand_name; geen toegang tot `profiles` van anderen. |
| 7 | Tracking | OK. Redirect alleen naar opgeslagen https-URL, IP alleen gehasht, rate limit in DB, alleen `record_click` aangeroepen. |
| 8 | Security definer | OK: alle hebben vaste `search_path` en controleren `auth.uid()`/rol of `can_manage_accommodation`. Twee kleine hulpfuncties missen search_path (F4). |
| 9 | Admin server-side | OK. Alle admin-RPC's checken `has_role(admin)`; RLS voor admin-tabellen. Rest-risico F3. |
| 10 | Secrets frontend | OK. Alleen publishable key in client; API-keys/demo-wachtwoord alleen server-side. |

## Bevindingen

| Bevinding | Ernst | Fix | Getest |
|---|---|---|---|
| F1. Accommodation Partner kan een eigen accommodatie met boekingen/links verwijderen; cascade wist boekingen, commissie-snapshots en de links/clicks/earnings van Distribution Partners. | Hoog | Trigger: verwijderen alleen toegestaan zolang er geen boekingen of tracking links aan hangen; anders melding "Pause this stay instead". UI-knop blijft bestaan. | nee (na fix: ja, via SQL-test) |
| F2. `anon` heeft tabel-grants (o.a. bookings, links, clicks, audit log). RLS blokkeert nu alles, maar het is onnodige blootstelling. Idem client insert/update-grants op tabellen die alleen via RPC beschreven worden (audit log, clicks). | Laag | Grants voor `anon` op alle public-tabellen intrekken; insert/update/delete voor `authenticated` op `admin_audit_log` en `distribution_clicks` intrekken. | nee (na fix: ja) |
| F3. Admin kan `platform_settings` (partner share) nog direct wijzigen zonder auditregel. | Middel | Zelfde guard als bij bookings: alleen via `admin_set_partner_share` (gelogd). | nee (na fix: ja) |
| F4. `asset_folder_uuid` en `clean_traveler_ref` zonder vaste search_path (geen security definer, pure helpers). | Laag | `SET search_path = public` toevoegen. | nee (na fix: ja, linter) |
| F5. `has_role(uuid, role)` is door elke ingelogde gebruiker aan te roepen voor een willekeurige user-id (onthult rol bij bekend UUID). | Laag | Geen wijziging: nodig voor RLS, UUID's zijn niet te raden. Geaccepteerd risico. | n.v.t. |
| F6. Tracking valt terug op `x-forwarded-for` als `cf-connecting-ip` ontbreekt (spoofbaar, beïnvloedt uniciteit/rate limit). | Laag | Geen wijziging: productie zet altijd `cf-connecting-ip`. | n.v.t. |
| F7. Linter: 7 security definer-functies uitvoerbaar door anon. | Info | Zijn triggerfuncties; kunnen niet los worden aangeroepen. Geen wijziging. | ja |
| F8. Dependency-scan: js-yaml (via framework-build) CPU-advisory. | Laag | Geen app-impact (alleen build); oplossen bij volgende framework-update. | ja |

## Technische details (na goedkeuring)

- Migratie: `accommodations_delete_guard` (BEFORE DELETE, niet voor service role) weigert bij bestaande `bookings` of `distribution_links`.
- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;` + `ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM anon`; `REVOKE INSERT, UPDATE, DELETE ON admin_audit_log, distribution_clicks FROM authenticated`.
- `admin_write_guard` uitbreiden met `platform_settings`; `admin_set_partner_share` zet `vellum.admin_change`.
- `ALTER FUNCTION ... SET search_path = public` voor de twee helpers.
- Verifiëren met SQL-tests die `request.jwt.claims` simuleren (AP-delete met boeking, admin direct update platform_settings, anon select) en de linter opnieuw draaien.
- Geen UI-functionaliteit verwijderd; de delete-knop toont bij blokkade de bestaande vriendelijke foutmelding.
