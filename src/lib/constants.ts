import type { Database } from "@/integrations/supabase/types";

export type Niche = Database["public"]["Enums"]["niche"];
export type DistributionType = Database["public"]["Enums"]["distribution_type"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type AccommodationStatus = Database["public"]["Enums"]["accommodation_status"];
export type Accommodation = Omit<Database["public"]["Tables"]["accommodations"]["Row"], "effective_pool_pct" | "recommendation_score">;

export const NICHES: { value: Niche; label: string }[] = [
  { value: "luxury", label: "Luxury" },
  { value: "boutique", label: "Boutique" },
  { value: "family", label: "Family" },
  { value: "couples", label: "Couples" },
  { value: "wellness", label: "Wellness" },
  { value: "food_wine", label: "Food & wine" },
  { value: "adventure", label: "Adventure" },
  { value: "design", label: "Design" },
  { value: "sustainable", label: "Sustainable" },
  { value: "slow_travel", label: "Slow travel" },
  { value: "beach", label: "Beach" },
  { value: "city", label: "City" },
  { value: "romantic", label: "Romantic" },
  { value: "lgbtq_friendly", label: "LGBTQ+ friendly" },
  { value: "cycling", label: "Cycling" },
];

export const DISTRIBUTION_TYPES: { value: DistributionType; label: string }[] = [
  { value: "creator", label: "Creator" },
  { value: "travel_advisor", label: "Travel advisor" },
  { value: "boutique_agency", label: "Boutique agency" },
  { value: "curator", label: "Curator" },
  { value: "publisher", label: "Publisher" },
  { value: "niche_community", label: "Niche community" },
];

/** ISO country codes used both as source markets and property countries. */
export const MARKETS: { value: string; label: string }[] = [
  { value: "NL", label: "Netherlands" },
  { value: "BE", label: "Belgium" },
  { value: "DE", label: "Germany" },
  { value: "UK", label: "United Kingdom" },
  { value: "FR", label: "France" },
  { value: "US", label: "United States" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "PT", label: "Portugal" },
  { value: "GR", label: "Greece" },
  { value: "AT", label: "Austria" },
  { value: "CH", label: "Switzerland" },
  { value: "DK", label: "Denmark" },
  { value: "SE", label: "Sweden" },
  { value: "NO", label: "Norway" },
];

export const nicheLabel = (n: Niche) => NICHES.find((x) => x.value === n)?.label ?? n;
export const marketLabel = (m: string) => MARKETS.find((x) => x.value === m)?.label ?? m;
export const distributionTypeLabel = (d: DistributionType | null) =>
  DISTRIBUTION_TYPES.find((x) => x.value === d)?.label ?? "";

export const formatPct = (n: number | string) => {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `${Number.isInteger(v) ? v : v.toFixed(v * 10 === Math.round(v * 10) ? 1 : 2)}%`;
};

export type AccommodationType = Database["public"]["Enums"]["accommodation_type"];
export const ACCOMMODATION_TYPES: { value: AccommodationType; label: string }[] = [
  { value: "villa", label: "Villa" },
  { value: "boutique_hotel", label: "Boutique hotel" },
  { value: "hotel", label: "Hotel" },
  { value: "apartment", label: "Apartment" },
  { value: "bnb", label: "B&B" },
  { value: "resort", label: "Resort" },
  { value: "unique_stay", label: "Unique stay" },
  { value: "other", label: "Other" },
];
export const accommodationTypeLabel = (t: AccommodationType | null) =>
  ACCOMMODATION_TYPES.find((x) => x.value === t)?.label ?? "";

export const ACCOMMODATION_STATUS_LABEL: Record<AccommodationStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  active: "Active",
  paused: "Paused",
  published: "Published",
};

/** Mirrors the DB constraint acc_complete_when_submitted. */
export function accommodationDetailsComplete(a: Partial<Accommodation>) {
  return !!(
    a.name && a.accommodation_type && a.country && a.region && a.city &&
    a.max_guests && a.starting_price_per_night && a.short_description &&
    (a.website_url || a.booking_url)
  );
}

export const isHttpsUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
};

export type ApBusinessType = Database["public"]["Enums"]["ap_business_type"];
export type AccommodationCountBand = Database["public"]["Enums"]["accommodation_count_band"];
export type ApGoal = Database["public"]["Enums"]["ap_goal"];
export type ReachBand = Database["public"]["Enums"]["reach_band"];

export const AP_BUSINESS_TYPES: { value: ApBusinessType; label: string }[] = [
  { value: "individual_owner", label: "Individual Property Owner" },
  { value: "boutique_hotel", label: "Boutique Hotel" },
  { value: "independent_hotel", label: "Independent Hotel" },
  { value: "villa_management", label: "Villa Management Company" },
  { value: "bnb", label: "B&B" },
  { value: "resort", label: "Resort" },
  { value: "other", label: "Other" },
];
export const ACCOMMODATION_COUNT_BANDS: { value: AccommodationCountBand; label: string }[] = [
  { value: "1", label: "1" },
  { value: "2_5", label: "2-5" },
  { value: "6_20", label: "6-20" },
  { value: "21_plus", label: "21+" },
];
export const AP_GOALS: { value: ApGoal; label: string }[] = [
  { value: "direct_bookings", label: "Generate more direct bookings" },
  { value: "reduce_ota_dependency", label: "Reduce dependency on OTAs" },
  { value: "new_audiences", label: "Reach new audiences" },
  { value: "travel_seller_relationships", label: "Build relationships with travel sellers" },
  { value: "fill_low_demand", label: "Fill low-demand periods" },
];
export const REACH_BANDS: { value: ReachBand; label: string }[] = [
  { value: "lt_1k", label: "<1k" },
  { value: "1k_10k", label: "1k-10k" },
  { value: "10k_50k", label: "10k-50k" },
  { value: "50k_250k", label: "50k-250k" },
  { value: "250k_plus", label: "250k+" },
];
