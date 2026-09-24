# Vellum MVP — Productplan en technische architectuur

## 0. Uitgangspunten en afwijkingen van de huidige stand
- Wat er nu al staat: `profiles`, `user_roles`, `accommodations` (status `draft|published`), `complete_onboarding()`, `has_role()`. Die worden gemigreerd, niet weggegooid.
- Status-enum wordt `draft | pending_review | active | paused`; `published` wordt gemapt naar `active`.
- **"Edge function" voor /go/[code]:** deze stack heeft geen losse edge functions. Het wordt een server route (`/go/$code`, server handler) die op dezelfde edge-runtime draait. Het gedrag is hetzelfde: loggen en dan een 302-redirect. Dit is een technische vertaling en geen scopewijziging.
- Commissievelden op accommodatie: `commission_pool_pct` (door AP gekozen). De split (partner/platform) komt uit `platform_settings` (admin) en wordt per boeking vastgelegd als snapshot. `partner_share_pct`, `partner_commission_pct` en `platform_commission_pct` op `accommodations` vervallen.
- EUR only, bedragen `numeric(12,2)`, percentages `numeric(5,2)`, `is_demo` op elke tabel met voorbeelddata.

## 1. Datamodel

Legenda RLS: S/I/U/D = select/insert/update/delete. AP = accommodation_partner, DP = distribution_partner, ADM = admin. "RPC" = alleen via security definer functie, directe schrijfrechten dicht.

**profiles** — id (=auth uid, PK), display_name, company_name, distribution_type, country_code, website_url, is_demo, timestamps
- S: eigen rij, ADM alles. U: eigen rij (geen rol-/statusvelden). I/D: dicht (via `complete_onboarding`).
- Naam en bedrijf van tegenpartijen worden alleen zichtbaar via RPC `get_partner_public_profile()`.

**user_roles** — id, user_id, role app_role, unique(user_id, role)
- S: eigen rij. I/U/D: dicht (onboarding-RPC, admin-RPC).

**platform_settings** (één rij) — id, default_partner_share_pct (70.00), default_platform_share_pct (30.00, check: som = 100), updated_by, updated_at
- S: alle authenticated. U: ADM. I/D: dicht.

**accommodations** — id, owner_id, name, slug, location_name, region, country_code, description, niches niche[], markets text[], booking_url, currency 'EUR', commission_pool_pct, status, submitted_at, reviewed_at, reviewed_by, review_note, is_demo, timestamps
- S: owner; DP alleen `status='active'`; ADM alles.
- I: AP met owner_id = uid, status verplicht `draft`.
- U: owner, alleen content en commissie. Statuswissels uitsluitend via RPC (trigger blokkeert directe statuswijziging).
- D: owner, alleen bij `draft`.

**accommodation_media** — id, accommodation_id, storage_path, kind (photo|document|press_kit), caption, sort_order, is_demo
- S: volgt de zichtbaarheid van de accommodatie. I/U/D: owner. Private bucket, signed URLs.

**accommodation_status_history** — id, accommodation_id, from_status, to_status, actor_id, note, created_at
- S: owner + ADM. Schrijven alleen door trigger.

**partner_codes** — id, distribution_partner_id, code (uniek, bv. `VLA-7K2QX`), is_active, created_at
- Eén vaste persoonlijke code per DP, wordt bij onboarding aangemaakt.
- S: eigen code; ADM. Een AP ziet codes niet in een lijst, maar valideert ze via RPC `resolve_partner_code()`. I/U/D: dicht.

**tracking_links** — id, code (uniek, kort), distribution_partner_id, accommodation_id, label, is_active, created_at, is_demo; unique(dp, accommodation, label)
- S: eigen links; ADM. De owner ziet alleen aggregaten via RPC.
- I: DP, alleen voor een actieve accommodatie. U: eigen rij, alleen `label` en `is_active`. D: dicht (deactiveren in plaats van verwijderen, zodat attributie intact blijft).

**saved_accommodations** — dp_id, accommodation_id, created_at (PK samengesteld)
- S/I/D: eigen rijen. Genereert een `save`-event.

**bookings** — id, accommodation_id, distribution_partner_id, attribution_source (tracking_link|partner_code), tracking_link_id null, partner_code_id null, guest_reference (vrije tekst, geen PII-verplichting), check_in, check_out, booking_value (numeric 12,2), currency, status (reported|confirmed|rejected|cancelled), reported_by_role (ap|dp), reported_by, confirmed_by, confirmed_at, rejection_reason, is_demo, timestamps
- Snapshot-kolommen (door trigger ingevuld en daarna immutable): commission_pool_pct_snapshot, partner_share_pct_snapshot, platform_share_pct_snapshot, commission_total, partner_commission, platform_commission.
- S: owner van de accommodatie, de betrokken DP, ADM. De DP ziet `platform_commission` niet (view `bookings_dp` zonder die kolom, of een RPC).
- I: via RPC `report_booking()` (AP → direct `confirmed`; DP → `reported`).
- U: via RPC `confirm_booking()`, `reject_booking()`, `cancel_booking()`. D: dicht.

**activity_events** (append-only, één tabel voor alle gedragsdata) — id bigint, occurred_at, event_type enum (accommodation_view, accommodation_save, accommodation_unsave, media_download, link_created, link_click, code_resolved, booking_reported, booking_confirmed, booking_rejected, status_changed), actor_id null, actor_role null, accommodation_id null, distribution_partner_id null, tracking_link_id null, booking_id null, metadata jsonb (referrer, country, ua_hash), is_demo
- Indexen op (accommodation_id, occurred_at), (distribution_partner_id, occurred_at), (event_type, occurred_at).
- S: dicht voor gebruikers; ADM alles. AP en DP krijgen alleen aggregaten via RPC's.
- I: alleen via `log_event()` (security definer, whitelist per rol) of vanuit triggers / de server route. U/D: dicht.

## 2. Waar de logica zit

**Databasefuncties en triggers** (bron van waarheid, niet te omzeilen vanuit de frontend)
- `complete_onboarding()` (uitbreiden): maakt voor een DP ook de `partner_code` aan.
- `generate_partner_code()` / `generate_link_code()`: alfabet zonder verwarrende tekens (0/O, 1/I), retry bij collisie.
- Statusflow `submit_for_review()` (AP: draft→pending_review, met validatie van verplichte velden, booking_url en commissie > 0), `approve_accommodation()` / `reject_accommodation(note)` (ADM), `pause_accommodation()` / `resume_accommodation()` (owner: active↔paused). Een trigger bewaakt de toegestane overgangen en schrijft `status_history` en het event.
- Trigger `bookings_snapshot` (BEFORE INSERT): leest pool% van de accommodatie en de split uit `platform_settings` en berekent de bedragen. Een BEFORE UPDATE-trigger blokkeert wijzigingen aan snapshots en bedragen.
- `report_booking()`, `confirm_booking()`, `reject_booking()`: rolcheck, eigenaarscheck, dedup-check, event loggen.
- `resolve_partner_code(code)`: geeft alleen de weergavenaam en een geldig/ongeldig-status terug (geen enumeratie; rate limit via tellen in events).
- `log_event()` voor client-side events (view, download) met whitelist.
- Aggregatie-RPC's: `ap_dashboard_stats()`, `dp_dashboard_stats()`, `admin_hypothesis_metrics()`.
- Waarom: geld en attributie moeten tamper-proof en consistent zijn, ook als iemand de Data API direct aanroept.

**Server routes / server functions**
- `/go/$code` (publiek, server route): link opzoeken met de service-client, controleren of link en accommodatie actief zijn, `link_click` loggen (met gehashte IP/UA, bot-filter en dedup binnen 30 min), daarna 302 naar `booking_url` met `ref`, `utm_source=platform`, `utm_medium=distribution` en `utm_campaign=<code>`. Bij een inactieve link: een nette fallbackpagina.
- Waarom server-side: reizigers zijn geen gebruikers (anoniem), dus er is geen anon-insert op de events-tabel nodig. De redirect-URL wordt server-side opgebouwd (geen open redirect).
- Signed URLs voor downloads plus het `media_download`-event: een server function.

## 3. Pagina's en navigatie

Publiek: `/` (landing), `/auth`, `/go/$code`.
Gedeeld (ingelogd): `/onboarding`, `/settings` (profiel).

**Accommodation Partner** — nav: Overview · Properties · Bookings · Settings
- `/dashboard`: KPI's (views, saves, clicks, bevestigde boekingen, commissie verschuldigd), taken ("2 boekingen te bevestigen").
- `/properties`, `/properties/new`, `/properties/$id` (tabs: Details, Media, Commission, Status + review-notitie, Performance).
- `/bookings`: lijst en filter, "Register booking" (partner code of link invoeren → resolve), bevestigen/afwijzen van gemelde boekingen.

**Distribution Partner** — nav: Discover · Saved · Links · Bookings · Settings
- `/discover`: catalogus met filters op niche, markt en land, gesorteerd op commissie.
- `/discover/$slug`: detail, media downloaden, opslaan, "Create tracking link".
- `/saved`.
- `/links`: eigen links met clicks, kopiëren en deactiveren; persoonlijke partner code prominent in beeld.
- `/bookings`: eigen boekingen met status en verdiende commissie; "Report booking".
- `/dashboard`: clicks, boekingen, conversie, verdiende commissie (confirmed vs pending).

**Admin** — nav: Review queue · Accommodations · Partners · Bookings · Metrics · Settings
- `/admin/review`: pending_review-lijst met goedkeuren/afwijzen en notitie.
- `/admin/accommodations`, `/admin/partners`, `/admin/bookings` (read-only met filters).
- `/admin/metrics`: hypothesefunnel uit `activity_events`.
- `/admin/settings`: standaardsplit 70/30.

Rolgebonden layout: één `_authenticated` shell die nav en home kiest op basis van `user_roles`. Admin-routes worden daarnaast afgeschermd via `has_role`, dus RLS is de echte grens en de UI alleen presentatie.

## 4. User journeys

**A. Accommodation Partner**
1. Sign-up (e-mail of Google) → `/onboarding` → rol AP, naam en bedrijf.
2. `/properties/new`: basisgegevens, niches, markten, booking_url, commissiepool %. Live preview van de split: "Partner earns X%, platform Y%", met de getallen uit de database.
3. Media uploaden → "Submit for review" → status `pending_review` en een melding op het dashboard.
4. Admin keurt goed → `active` en de accommodatie is zichtbaar in Discover.
5. Views, saves en clicks verschijnen op `/properties/$id` › Performance.
6. Boeking binnen: zelf registreren met de partner code (of een DP meldt, AP bevestigt) → snapshot vastgelegd.
7. Resultaat: dashboard toont bevestigde boekingen per partner en de verschuldigde commissie.

**B. Distribution Partner**
1. Sign-up → onboarding (rol DP en distribution_type) → persoonlijke partner code aangemaakt.
2. `/discover`: filteren, detail bekijken, opslaan, media downloaden.
3. "Create tracking link" → `/go/AB12CD` kopiëren en in het eigen kanaal plaatsen.
4. Reiziger klikt → click gelogd → redirect met UTM's.
5. Reiziger boekt: de AP registreert, óf de DP meldt de boeking en de AP bevestigt.
6. Resultaat: `/dashboard` en `/bookings` tonen clicks → boekingen → verdiende commissie (pending/confirmed).

## 5. Risico's en maatregelen
| Risico | Maatregel |
|---|---|
| Attributie is niet hard: de AP ziet de UTM/ref, maar niets verplicht tot registratie | De reported→confirm-flow geeft de DP een eigen spoor. Admin ziet de ratio clicks vs bevestigd per AP. Harde tracking (pixel/PMS) buiten MVP. |
| AP wijst terechte meldingen af | Verplichte reden, audit trail in events, admin-zicht op het afwijzingspercentage. Geen automatische geschillenflow (out of scope). |
| Dubbele claims (link én code, of twee DP's) | Eén DP per boeking. Dedup-check op accommodatie, datums en guest_reference, met waarschuwing aan de AP. Bij conflict beslist de AP; admin kan corrigeren. |
| Commissie wijzigt na boeking | Snapshot bij insert, immutable-trigger. Een pool-wijziging geldt alleen voor nieuwe boekingen. |
| Click-fraude / bots | Bot-UA-filter, dedup op gehashte IP+link in 30 min. Clicks leveren geen geld op, alleen boekingen. |
| Enumeratie van partner codes | Codes van 5 tekens uit een alfabet van 31 (~28M), resolve alleen voor een ingelogde AP, rate limit. |
| Open redirect via /go | De URL komt uitsluitend uit de database (`booking_url`, gevalideerd op https), nooit uit de querystring. |
| Datalek tussen tegenpartijen | Geen directe select op elkaars profielen of events; alleen RPC's met minimale kolommen. De DP ziet de platform-fee niet. |
| Groei van events-tabel | Append-only, gerichte indexen, aggregatie via RPC. Partitionering pas na het MVP. |
| PII van reizigers | Alleen een vrije referentie, geen naam of e-mail verplicht. IP wordt alleen gehasht opgeslagen. |
| Rol-escalatie | Rollen alleen via RPC, admin nooit via onboarding, alle checks via `has_role`. |

## Open punten (veranderen de architectuur)
1. Mag een AP ook boekingen registreren **zonder** DP-attributie? Voorstel: nee, want alleen geattribueerde boekingen horen in het platform.
2. Eén vaste partner code per DP, of ook codes per accommodatie? Voorstel: één per DP.
3. Hoe telt een DP-melding die de AP niet binnen X dagen behandelt: blijft die open, of wordt er geëscaleerd naar admin? Voorstel: open laten plus een signaal in de admin-lijst na 14 dagen, zonder automatische bevestiging.
