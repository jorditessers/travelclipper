// Turns backend/network errors into short, non-technical messages.
// Our own database rules raise readable sentences — those are kept; raw technical errors are replaced.
const TECHNICAL = /(permission denied|violates|duplicate key|jwt|pgrst|syntax|relation |column |function |null value|invalid input|constraint|42501|23\d{3}|failed to fetch|networkerror|load failed|timeout|unexpected|undefined|internal)/i;

export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again in a moment."): string {
  const raw = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  if (!raw) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return "We couldn't reach the server. Check your connection and try again.";
  if (/permission denied|42501|not allowed/i.test(raw)) return "You don't have access to do this. If you think that's wrong, contact support.";
  if (TECHNICAL.test(raw) || raw.length > 160) return fallback;
  return raw;
}

export const LOAD_ERROR_HINT = "We couldn't load this right now. Check your connection and try again.";
