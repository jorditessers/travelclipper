import type { Database } from "@/integrations/supabase/types";

type E = Database["public"]["Enums"];
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;

export const DEMO_DOMAIN = "demo.local";

export const DEMO_ACCOMMODATION_PARTNERS = [
  {
    key: "villas", email: "marta.ricci@demo.local", first: "Marta", last: "Ricci", company: "Casa Serena Villas", country: "IT",
    business_type: "villa_management" as E["ap_business_type"], website: "https://casaserena-villas.example",
    band: "6_20" as E["accommodation_count_band"],
    goals: ["direct_bookings", "reduce_ota_dependency", "new_audiences"] as E["ap_goal"][],
  },
  {
    key: "hotels", email: "jonas.berg@demo.local", first: "Jonas", last: "Berg", company: "Northlight Hotel Collection", country: "NL",
    business_type: "independent_hotel" as E["ap_business_type"], website: "https://northlight-hotels.example",
    band: "2_5" as E["accommodation_count_band"],
    goals: ["travel_seller_relationships", "fill_low_demand", "direct_bookings"] as E["ap_goal"][],
  },
];

export const DEMO_DISTRIBUTION_PARTNERS: {
  email: string; type: E["distribution_type"]; brand: string; website: string; social: string[];
  markets: string[]; niches: E["niche"][]; reach: E["reach_band"]; bio: string;
}[] = [
  { email: "lena.voss@demo.local", type: "creator", brand: "Lena Wanders", website: "https://lenawanders.example",
    social: ["https://instagram.com/lenawanders", "https://youtube.com/@lenawanders"], markets: ["DE", "NL", "BE"],
    niches: ["design", "slow_travel", "food_wine"], reach: "50k_250k",
    bio: "Slow travel stories and design-led stays for a German-speaking audience. Honest, long-form, no sponsored fluff." },
  { email: "claire.dubois@demo.local", type: "travel_advisor", brand: "Dubois Private Travel", website: "https://duboisprivate.example",
    social: ["https://linkedin.com/in/clairedubois"], markets: ["FR", "BE"], niches: ["luxury", "couples", "wellness"], reach: "1k_10k",
    bio: "Independent advisor planning bespoke European escapes for discerning couples since 2011." },
  { email: "sam.okafor@demo.local", type: "boutique_agency", brand: "Field & Tide Journeys", website: "https://fieldandtide.example",
    social: ["https://instagram.com/fieldandtide"], markets: ["UK", "US"], niches: ["adventure", "sustainable", "beach"], reach: "10k_50k",
    bio: "A small London agency crafting low-impact, high-character trips to coastlines and mountains." },
  { email: "noor.haddad@demo.local", type: "curator", brand: "The Quiet List", website: "https://thequietlist.example",
    social: ["https://instagram.com/thequietlist"], markets: ["NL", "UK", "DE"], niches: ["boutique", "design", "romantic"], reach: "10k_50k",
    bio: "A hand-picked list of calm, beautifully made places to stay. Every stay personally vetted." },
  { email: "tom.lindqvist@demo.local", type: "publisher", brand: "Northbound Magazine", website: "https://northbound-mag.example",
    social: ["https://instagram.com/northboundmag", "https://x.com/northboundmag"], markets: ["UK", "US", "DE", "NL"],
    niches: ["city", "design", "food_wine"], reach: "250k_plus",
    bio: "Independent travel magazine and weekly newsletter on cities, food and design across Europe." },
  { email: "isa.moreno@demo.local", type: "niche_community", brand: "Pedal & Pause", website: "https://pedalandpause.example",
    social: ["https://strava.com/clubs/pedalandpause"], markets: ["NL", "BE", "DE"], niches: ["cycling", "adventure", "slow_travel"], reach: "10k_50k",
    bio: "A community of 30,000 road and gravel cyclists who plan trips around great rides and better dinners." },
];

type Acc = {
  owner: "villas" | "hotels"; name: string; type: E["accommodation_type"]; country: string; region: string; city: string;
  guests: number; bedrooms: number; bathrooms: number; price: number; short: string; long: string;
  niches: E["niche"][]; suited: string[]; pool: number; markets: string[]; terms: string; approval: boolean; photos: string[];
};

export const DEMO_ACCOMMODATIONS: Acc[] = [
  { owner: "villas", name: "Masseria Ulivo Bianco", type: "villa", country: "IT", region: "Puglia", city: "Ostuni",
    guests: 12, bedrooms: 6, bathrooms: 6, price: 980, niches: ["luxury", "family", "food_wine"], suited: ["Multi-generation families", "Olive oil lovers"],
    short: "A restored 18th-century masseria among ancient olive groves, with a stone pool and a private chef on request.",
    long: "Ulivo Bianco sits on twelve hectares of centuries-old olive trees just outside Ostuni. Whitewashed vaulted rooms open onto shaded courtyards, and the long saltwater pool looks out to the Adriatic. Mornings start with burrata from the neighbouring farm; evenings end with dinner under the carob tree.",
    pool: 12, markets: ["UK", "US", "DE"], terms: "Credit @masseriaulivobianco. Please don't crop the logo on brand assets.", approval: false,
    photos: ["1613490493576-7fde63acd811", "1600596542815-ffad4c1539a9", "1505693416388-ac5ce068fe85", "1596394516093-501ba68a0ba6", "1602343168117-bb8ffe3e2e9f"] },
  { owner: "hotels", name: "Locanda dei Cipressi", type: "boutique_hotel", country: "IT", region: "Tuscany", city: "Montalcino",
    guests: 2, bedrooms: 1, bathrooms: 1, price: 420, niches: ["boutique", "food_wine", "romantic"], suited: ["Wine lovers", "Couples"],
    short: "Fourteen rooms in a hilltop farmhouse above Brunello vineyards, with a cellar restaurant and sunset terrace.",
    long: "A family-run locanda reached by a cypress-lined gravel road. Rooms mix terracotta floors with linen and oak; the cellar restaurant pours wines from the estates you can see from your window. Guided tastings and truffle walks are arranged in season.",
    pool: 10, markets: ["NL", "BE", "DE", "US"], terms: "Credit @locandadeicipressi. No filters that change food colours.", approval: false,
    photos: ["1564501049412-61c2a3083791", "1566073771259-6a8506099945", "1582719478250-c89cae4dc85b", "1590490360182-c33d57733427"] },
  { owner: "villas", name: "Finca Es Garrover", type: "villa", country: "ES", region: "Mallorca", city: "Sóller",
    guests: 8, bedrooms: 4, bathrooms: 3, price: 640, niches: ["family", "cycling", "slow_travel"], suited: ["Cyclists", "Families with teens"],
    short: "A stone finca in the orange groves of the Sóller valley, at the foot of the Tramuntana's best climbs.",
    long: "Es Garrover has been in the same family for four generations. Thick stone walls keep the rooms cool, the pool is fed by a mountain spring and the terrace faces the Puig Major. Secure bike storage, a workshop stand and route cards for the Sa Calobra climb are ready for riders.",
    pool: 11, markets: ["DE", "NL", "UK"], terms: "Tag @fincaesgarrover and #sollervalley.", approval: false,
    photos: ["1580587771525-78b9dba3b914", "1512917774080-9991f1c4c750", "1540518614846-7eded433c457", "1586375300773-8384e3e4916f", "1600585154340-be6161a56a0c"] },
  { owner: "hotels", name: "Casa Sal Ibiza", type: "boutique_hotel", country: "ES", region: "Ibiza", city: "Santa Gertrudis",
    guests: 3, bedrooms: 1, bathrooms: 1, price: 510, niches: ["design", "wellness", "lgbtq_friendly"], suited: ["Design lovers", "Yoga weekends"],
    short: "A calm, whitewashed hideaway in the island's green interior, far from the clubs and close to the best farm tables.",
    long: "Twelve suites arranged around a courtyard of fig and almond trees. Morning yoga on the roof, a plunge pool in every garden suite and a kitchen built around the hotel's own vegetable plot. The quiet side of Ibiza, twenty minutes from the beaches of the north.",
    pool: 13, markets: ["UK", "NL", "DE", "FR"], terms: "Credit @casasalibiza. Please don't show other guests without consent.", approval: true,
    photos: ["1571003123894-1f0594d2b5d9", "1618773928121-c32242e63f39", "1520250497591-112f2f40a3f4", "1551882547-ff40c63fe5fa"] },
  { owner: "villas", name: "Quinta da Figueira", type: "villa", country: "PT", region: "Algarve", city: "Tavira",
    guests: 10, bedrooms: 5, bathrooms: 4, price: 560, niches: ["family", "beach", "sustainable"], suited: ["Families", "Beach days"],
    short: "A solar-powered quinta between the salt pans of Tavira and quiet barrier-island beaches.",
    long: "Quinta da Figueira pairs traditional Algarvian chimneys with a low-impact renovation: solar power, rainwater gardens and a natural swimming pond. Ten minutes by bike to Tavira's old town, and a short ferry to the empty sands of Ilha de Tavira.",
    pool: 9, markets: ["UK", "NL", "DE"], terms: "Credit @quintadafigueira.", approval: false,
    photos: ["1600596542815-ffad4c1539a9", "1507525428034-b723cf961d3e", "1505693416388-ac5ce068fe85", "1512917774080-9991f1c4c750"] },
  { owner: "villas", name: "Villa Anemos", type: "villa", country: "GR", region: "Cyclades", city: "Paros",
    guests: 14, bedrooms: 7, bathrooms: 7, price: 1400, niches: ["luxury", "beach", "romantic"], suited: ["Celebrations", "Friends' getaways"],
    short: "A clifftop villa above a private cove, with an infinity pool facing the sunset over Antiparos.",
    long: "Villa Anemos is named for the meltemi wind that keeps its terraces cool through August. Seven suites step down the cliff, each with its own terrace; a path leads to a sheltered swimming cove. Boat days to Antiparos and private dinners are arranged by the house manager.",
    pool: 15, markets: ["US", "UK", "FR"], terms: "Credit @villaanemos. No drone footage of neighbouring properties.", approval: true,
    photos: ["1570077188670-e3a8d69ac5ff", "1613490493576-7fde63acd811", "1540518614846-7eded433c457", "1499793983690-e29da59ef1c2", "1602343168117-bb8ffe3e2e9f", "1507525428034-b723cf961d3e"] },
  { owner: "villas", name: "Sukha Retreat Ubud", type: "resort", country: "ID", region: "Bali", city: "Ubud",
    guests: 2, bedrooms: 1, bathrooms: 1, price: 290, niches: ["wellness", "sustainable", "couples"], suited: ["Wellness seekers", "Honeymooners"],
    short: "Bamboo pavilions above the Ayung river, with daily yoga, a plant-based kitchen and a traditional Balinese spa.",
    long: "Sukha is a retreat of nine bamboo pavilions built by local craftspeople into a jungle ravine. Days follow a gentle rhythm of sunrise yoga, rice-field walks and treatments rooted in Balinese healing. Everything on the menu is grown within a short drive.",
    pool: 10, markets: ["NL", "DE", "UK", "US"], terms: "Credit @sukharetreat. Please show our team respectfully.", approval: false,
    photos: ["1537996194471-e657df975ab4", "1544124499-58912cbddaad", "1510798831971-661eb04b3739", "1571003123894-1f0594d2b5d9"] },
  { owner: "hotels", name: "Hotel Grachtenlicht", type: "boutique_hotel", country: "NL", region: "North Holland", city: "Amsterdam",
    guests: 2, bedrooms: 1, bathrooms: 1, price: 260, niches: ["city", "design", "boutique"], suited: ["City breaks", "Design lovers"],
    short: "Three 17th-century canal houses joined into one quiet, art-filled hotel on the Keizersgracht.",
    long: "Twenty-one rooms with original beams, Dutch design furniture and views over the canal or the hidden garden. The breakfast room doubles as a gallery for young Amsterdam artists, and the hotel's own boat takes guests out in the early evening.",
    pool: 8, markets: ["UK", "US", "DE", "FR"], terms: "Credit @grachtenlicht. Please credit artists shown in the gallery.", approval: false,
    photos: ["1534351590666-13e3e96b5017", "1582719478250-c89cae4dc85b", "1445019980597-93fa8acb246c", "1590490360182-c33d57733427"] },
  { owner: "villas", name: "Domaine des Lavandes", type: "villa", country: "FR", region: "Provence", city: "Gordes",
    guests: 10, bedrooms: 5, bathrooms: 5, price: 890, niches: ["luxury", "food_wine", "slow_travel"], suited: ["Food lovers", "Long summer stays"],
    short: "A stone bastide in lavender fields below Gordes, with a walled potager and a pool among the olive trees.",
    long: "Domaine des Lavandes is a 19th-century bastide restored with limewashed walls, reclaimed tiles and a long farmhouse table built for slow lunches. The walled kitchen garden supplies the summer cooking classes; the Saturday market in Apt is fifteen minutes away.",
    pool: 12, markets: ["UK", "US", "BE", "NL"], terms: "Credit @domainedeslavandes.", approval: false,
    photos: ["1600585154340-be6161a56a0c", "1580587771525-78b9dba3b914", "1596394516093-501ba68a0ba6", "1505693416388-ac5ce068fe85", "1586375300773-8384e3e4916f"] },
  { owner: "hotels", name: "Almhof Steinberg", type: "unique_stay", country: "AT", region: "Tyrol", city: "Alpbach",
    guests: 6, bedrooms: 3, bathrooms: 2, price: 340, niches: ["adventure", "family", "wellness"], suited: ["Hikers", "Ski families"],
    short: "A timber mountain lodge at 1,300 metres with a wood-fired sauna, hay-bed spa and trails from the door.",
    long: "Almhof Steinberg is a rebuilt alpine farmhouse of larch and stone, run by a family of mountain guides. Summers are for hut-to-hut hikes and wildflower meadows; winters for ski touring and evenings by the tiled stove. The sauna looks straight onto the Wiedersberger Horn.",
    pool: 10, markets: ["DE", "NL", "BE", "UK"], terms: "Credit @almhofsteinberg. Tag the Alpbachtal.", approval: false,
    photos: ["1476514525535-07fb3b4ae5f1", "1542314831-068cd1dbfeeb", "1540518614846-7eded433c457", "1445019980597-93fa8acb246c"] },
  { owner: "hotels", name: "Pwani House Zanzibar", type: "boutique_hotel", country: "TZ", region: "Zanzibar", city: "Stone Town",
    guests: 3, bedrooms: 1, bathrooms: 1, price: 180, niches: ["boutique", "beach", "romantic"], suited: ["Honeymooners", "Culture lovers"],
    short: "A restored Omani merchant house in Stone Town, with carved doors, a rooftop restaurant and a sister beach house.",
    long: "Pwani House occupies a 19th-century merchant's home steps from the old harbour. Ten rooms feature carved Zanzibari beds and brass-studded doors; the rooftop serves Swahili seafood as the dhows come in. Guests can split their stay with the hotel's six-room beach house in Matemwe.",
    pool: 14, markets: ["UK", "NL", "DE", "US"], terms: "Credit @pwanihouse. Please avoid photographing neighbours without consent.", approval: true,
    photos: ["1566073771259-6a8506099945", "1520250497591-112f2f40a3f4", "1551882547-ff40c63fe5fa", "1507525428034-b723cf961d3e", "1618773928121-c32242e63f39"] },
  { owner: "hotels", name: "Hotel Kanal Nord", type: "hotel", country: "DK", region: "Capital Region", city: "Copenhagen",
    guests: 2, bedrooms: 1, bathrooms: 1, price: 140, niches: ["design", "city", "cycling"], suited: ["Design lovers", "Bike-friendly city trips"],
    short: "A former harbour warehouse turned into a Scandinavian design hotel, with free bikes and a harbour-bath next door.",
    long: "Kanal Nord keeps the warehouse's brick and steel and fills it with Danish classics and pieces by young local makers. Every room has a Copenhagen-made bike waiting downstairs, the harbour baths are across the quay, and breakfast comes from the bakery on the corner.",
    pool: 8, markets: ["DE", "NL", "UK", "US"], terms: "Credit @hotelkanalnord and the designers where visible.", approval: false,
    photos: ["1513622470522-26c3c8a854bc", "1582719478250-c89cae4dc85b", "1445019980597-93fa8acb246c", "1564501049412-61c2a3083791"] },
];

export const demoPhoto = U;

/** Guided demo tour: which accounts the demo buttons sign in as, and which stay the tour uses. */
export const DEMO_TOUR = {
  apKey: "villas" as const,
  apEmail: "marta.ricci@demo.local",
  dpEmail: "lena.voss@demo.local",
  accommodationName: "Finca Es Garrover",
};
