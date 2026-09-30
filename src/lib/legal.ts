// Company details and versions for the legal pages and the acceptance record.
// Fill in the empty fields before going live; empty fields show as a visible [placeholder].
export const LEGAL_ENTITY = {
  platformName: "Holiday Clippers",
  legalName: "", // juridische bedrijfsnaam, e.g. "Holidayclippers B.V."
  address: "", // vestigingsadres
  coc: "", // KvK-nummer
  vat: "", // btw-nummer
  email: "holidayclippers@proton.me", // support, klachten en privacy
  website: "https://travelclipper.vercel.app",
  liabilityCap: "", // maximum aansprakelijkheid in euro, e.g. "10.000"
};

const LABELS: Record<keyof typeof LEGAL_ENTITY, string> = {
  platformName: "platformnaam", legalName: "juridische bedrijfsnaam", address: "adres", coc: "KvK-nummer",
  vat: "btw-nummer", email: "e-mailadres", website: "website", liabilityCap: "bedrag",
};

export function legalValue(k: keyof typeof LEGAL_ENTITY) {
  const v = LEGAL_ENTITY[k];
  return v ? (k === "liabilityCap" ? `€${v}` : v) : `[${LABELS[k]}]`;
}

/** Replaces {platformName}-style tokens with the company details. */
export const fillLegal = (text: string) =>
  text.replace(/\{(\w+)\}/g, (_m, k: string) => (k in LEGAL_ENTITY ? legalValue(k as keyof typeof LEGAL_ENTITY) : _m));

/**
 * Versions users accept at sign-up (stored with date/time as proof of acceptance).
 * Bump a version when the text changes materially; it is recorded per acceptance.
 */
export const TERMS_VERSION = "2026-09-29";
export const PRIVACY_VERSION = "2026-09-29";
export const formatLegalVersion = (v: string) =>
  new Date(`${v}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
