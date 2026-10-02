// Browser-only demo backend: when no Supabase project is configured, the app runs against a
// PostgreSQL database (PGlite) inside the visitor's browser. Nothing leaves the device.
// This file stays tiny: it is imported by the Supabase client on every page.

export const DEMO_SUPABASE_URL = "https://demo-backend.vellum.local";
export const DEMO_ANON_KEY = "demo-anon-key";
export const DEMO_SERVICE_KEY = "demo-service-role-key";
/** Shared password of the seeded demo accounts. Only exists inside the visitor's browser. */
export const LOCAL_DEMO_PASSWORD = "vellum-demo-2026";
export const LOCAL_DEMO_ADMIN_EMAIL = "admin@demo.local";

const first = (...v: (string | undefined)[]) => v.find((x) => typeof x === "string" && x.length > 0);

/**
 * Supabase URL + public key. Accepts our own variable names and the ones the Vercel ↔ Supabase
 * integration sets (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_ANON_KEY, …). NEXT_PUBLIC_* reaches the
 * browser through Vite's envPrefix (see vite.config.ts).
 */
export function supabaseEnv() {
  const env = typeof process !== "undefined" ? process.env : {};
  const m = import.meta.env as Record<string, string | undefined>;
  return {
    url: first(m["VITE_SUPABASE_URL"], m["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_URL"]),
    key: first(
      m["VITE_SUPABASE_PUBLISHABLE_KEY"], m["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], m["NEXT_PUBLIC_SUPABASE_ANON_KEY"], m["VITE_SUPABASE_ANON_KEY"],
      env["SUPABASE_PUBLISHABLE_KEY"], env["SUPABASE_ANON_KEY"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ),
  };
}

/** Server-only: service role key (same name in our setup and in the Vercel integration). */
export const supabaseServiceKey = () => (typeof process !== "undefined" ? process.env["SUPABASE_SERVICE_ROLE_KEY"] : undefined);

/** True in the browser when no Supabase project is configured: the app then uses the local demo backend. */
export function isLocalDemo(): boolean {
  if (typeof window === "undefined") return false;
  const { url, key } = supabaseEnv();
  return !(url && key);
}

/* Status of the demo backend, kept here so the UI can show it without loading the database engine. */
export type DemoStatus = { state: "idle" | "preparing" | "ready" | "error"; step?: string; error?: string };
let status: DemoStatus = { state: "idle" };
const listeners = new Set<(s: DemoStatus) => void>();
export function setDemoStatus(s: DemoStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}
export const getDemoStatus = () => status;
export function onDemoStatus(l: (s: DemoStatus) => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
