export type Campaign = {
  id?: string;
  name: string;
  commission_pool_pct: number | string;
  starts_on: string;
  ends_on: string;
  description?: string | null;
};

/** Today's date (UTC) as YYYY-MM-DD — matches current_date in the database. */
export const todayISO = () => new Date().toISOString().slice(0, 10);

export const isLive = (c: Campaign, today = todayISO()) => c.starts_on <= today && c.ends_on >= today;

export const liveCampaign = <T extends Campaign>(list: T[] | null | undefined, today = todayISO()) =>
  (list ?? []).find((c) => isLive(c, today)) ?? null;

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
