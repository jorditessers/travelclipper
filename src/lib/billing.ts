import type { Database } from "@/integrations/supabase/types";

export type BillingDetails = Database["public"]["Tables"]["billing_details"]["Row"];

// ISO 3166-1 alpha-2. Billing addresses can be anywhere, so this is wider than MARKETS.
const ISO_COUNTRIES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

let countryOptions: { value: string; label: string }[] | null = null;
export function billingCountryOptions() {
  if (!countryOptions) {
    let names: Intl.DisplayNames | null = null;
    try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch { /* old browser: show codes */ }
    countryOptions = ISO_COUNTRIES.map((c) => ({ value: c, label: names?.of(c) ?? c })).sort((a, b) => a.label.localeCompare(b.label));
  }
  return countryOptions;
}

export const normalizeIban = (v: string) => v.replace(/\s+/g, "").toUpperCase();
export const formatIban = (v: string) => normalizeIban(v).replace(/(.{4})(?=.)/g, "$1 ");
export const normalizeVat = (v: string) => v.replace(/[\s.-]+/g, "").toUpperCase();

/** ISO 13616 mod-97 check. Mirrors public.iban_is_valid. */
export function isValidIban(v: string) {
  const s = normalizeIban(v);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  let r = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const n = /[A-Z]/.test(ch) ? ch.charCodeAt(0) - 55 : Number(ch);
    r = (r * (n >= 10 ? 100 : 10) + n) % 97;
  }
  return r === 1;
}
export const isValidVat = (v: string) => /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(normalizeVat(v));
export const isValidEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/** Payout details are complete once we can transfer money; invoicing details once we can address an invoice. */
export function billingComplete(b: BillingDetails | null | undefined, needsPayout: boolean) {
  if (!b) return false;
  return needsPayout ? !!(b.iban && b.account_holder) : true;
}
