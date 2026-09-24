// Browser-only demo backend: when no Supabase project is configured, the app runs against a
// PostgreSQL database (PGlite) inside the visitor's browser. Nothing leaves the device.
// This file stays tiny: it is imported by the Supabase client on every page.

export const DEMO_SUPABASE_URL = "https://demo-backend.vellum.local";
export const DEMO_ANON_KEY = "demo-anon-key";
export const DEMO_SERVICE_KEY = "demo-service-role-key";
/** Shared password of the seeded demo accounts. Only exists inside the visitor's browser. */
export const LOCAL_DEMO_PASSWORD = "vellum-demo-2026";
export const LOCAL_DEMO_ADMIN_EMAIL = "admin@demo.local";

export function supabaseEnv() {
  const env = typeof process !== "undefined" ? process.env : {};
  return {
    url: (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) || env["SUPABASE_URL"],
    key: (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) || env["SUPABASE_PUBLISHABLE_KEY"],
  };
}

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
