// Environment-agnostic core of the in-browser demo backend (also runs under Node for tests).
import type { PGliteInterface } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { BOOTSTRAP_SQL, prepareMigration } from "./bootstrap";
import { createUser, decodeJwt, handleAuth } from "./auth";
import { ApiError, handleRest, lit, loadMeta, type Claims, type Meta } from "./postgrest";
import { readObjects, removeObjects, uploadObject } from "./storage";
import { DEMO_ANON_KEY, DEMO_SERVICE_KEY, DEMO_SUPABASE_URL, LOCAL_DEMO_ADMIN_EMAIL, LOCAL_DEMO_PASSWORD } from "./mode";

// Local-only adjustments on top of the migrations.
const LOCAL_OVERRIDES_SQL = `
-- Everyone who signs up in the browser demo should see the seeded stays; demo tour sessions keep seeing demo rows only.
CREATE OR REPLACE FUNCTION public.is_distributable(_accommodation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM accommodations a JOIN accommodation_distribution_settings s ON s.accommodation_id = a.id
    WHERE a.id = _accommodation_id AND a.status::text = 'active' AND s.distribution_enabled AND s.commission_pool_pct IS NOT NULL
      AND (auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') OR NOT public.is_demo_user(auth.uid()) OR a.is_demo))
$$;
CREATE SCHEMA IF NOT EXISTS demo_backend;
CREATE TABLE IF NOT EXISTS demo_backend.meta (key text PRIMARY KEY, value text);
`;

export type Backend = {
  db: PGliteInterface;
  meta: Meta;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  claimsFor: (token: string | null | undefined) => Claims;
  signedUrls: (bucket: string, paths: string[], token: string | null | undefined) => Promise<Map<string, { data: Uint8Array; mime: string }>>;
};

export function claimsFor(token: string | null | undefined): Claims {
  if (!token || token === DEMO_ANON_KEY) return { role: "anon" };
  if (token === DEMO_SERVICE_KEY) return { role: "service_role" };
  const p = decodeJwt(token);
  if (!p || typeof p["sub"] !== "string") return { role: "anon" };
  if (typeof p["exp"] === "number" && p["exp"] * 1000 < Date.now()) throw new ApiError(401, { code: "PGRST303", message: "JWT expired", details: null, hint: null });
  return { ...p, role: "authenticated", sub: p["sub"] as string } as Claims;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 || body === undefined ? null : JSON.stringify(body), {
    status, headers: { "content-type": "application/json", ...headers },
  });

function pgErrorBody(e: unknown) {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  const code = err.code ?? "XX000";
  const status = code === "42501" ? 403 : code === "23505" ? 409 : code.startsWith("22") || code.startsWith("23") || code === "P0001" ? 400 : 400;
  return { status, body: { code, message: err.message ?? "Database error", details: err.detail ?? null, hint: err.hint ?? null } };
}

/** Runs bootstrap + migrations + demo seed when the database is new. Safe with several tabs open. */
export async function setupDatabase(db: PGliteInterface, migrations: string[], onProgress?: (step: string) => void): Promise<Backend> {
  // Schema creation is one transaction, so a second tab either sees nothing or the finished schema.
  const created = await db.transaction(async (tx) => {
    const exists = (await tx.query<{ r: string | null }>(`SELECT to_regclass('demo_backend.meta')::text AS r`)).rows[0]?.r;
    if (exists) return false;
    onProgress?.("Creating the database");
    await tx.exec(BOOTSTRAP_SQL);
    for (const m of migrations) await tx.exec(prepareMigration(m));
    await tx.exec(LOCAL_OVERRIDES_SQL);
    await tx.query(`INSERT INTO demo_backend.meta (key, value) VALUES ('seeding', now()::text)`);
    return true;
  });
  const backend = await makeBackend(db);
  const isSeeded = async () => (await db.query(`SELECT 1 FROM demo_backend.meta WHERE key = 'seeded'`)).rows.length > 0;
  if (!(await isSeeded())) {
    // Another tab may be seeding right now: wait for it, and take over if it never finishes.
    if (!created) {
      for (let i = 0; i < 90 && !(await isSeeded()); i++) await new Promise((r) => setTimeout(r, 500));
    }
    if (!(await isSeeded())) {
      onProgress?.("Adding demo stays, partners and bookings");
      await seed(backend);
      await db.query(`INSERT INTO demo_backend.meta (key, value) VALUES ('seeded', now()::text) ON CONFLICT (key) DO NOTHING`);
    }
  }
  // pg_cron stand-in: the daily job that moves stays past check-out to "completed".
  await db.exec(`SELECT public.complete_past_bookings()`);
  return backend;
}

export function serviceClient(backend: Backend): SupabaseClient<Database> {
  return createClient<Database>(DEMO_SUPABASE_URL, DEMO_SERVICE_KEY, {
    global: { fetch: backend.fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "sb-demo-service" },
  });
}

async function seed(backend: Backend) {
  const { runDemoSeed } = await import("@/lib/demo-seed-run");
  await runDemoSeed(serviceClient(backend), LOCAL_DEMO_PASSWORD);
  const { db } = backend;
  const admin = await createUser(db, LOCAL_DEMO_ADMIN_EMAIL, LOCAL_DEMO_PASSWORD);
  await db.exec(`
    INSERT INTO public.profiles (id, email, first_name, last_name, display_name, company_name, country, onboarding_completed, is_demo)
    VALUES (${lit(admin.id)}, ${lit(LOCAL_DEMO_ADMIN_EMAIL)}, 'Demo', 'Admin', 'Demo Admin', 'Platform team', 'NL', true, true)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (${lit(admin.id)}, 'admin') ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.platform_settings SET demo_mode_enabled = true;
  `);
}

async function makeBackend(db: PGliteInterface): Promise<Backend> {
  const meta = await loadMeta(db);
  const backend: Backend = {
    db, meta, claimsFor,
    signedUrls: (bucket, paths, token) => readObjects(db, claimsFor(token), bucket, paths),
    fetch: async (input, init) => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? req.headers.get("apikey");
      try {
        if (url.pathname.startsWith("/rest/v1")) {
          const claims = claimsFor(auth);
          const text = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
          const r = await handleRest(db, meta, claims, {
            method: req.method, path: url.pathname.slice("/rest/v1".length), params: url.searchParams, headers: req.headers,
            body: text ? JSON.parse(text) : undefined,
          });
          return json(r.body, r.status, r.headers);
        }
        if (url.pathname.startsWith("/auth/v1")) {
          let claims: Claims | null = null;
          try { claims = claimsFor(auth); } catch { claims = null; }
          const text = req.method === "GET" ? "" : await req.text();
          const body = text ? JSON.parse(text) : {};
          const r = await handleAuth(db, claims, req.method, url.pathname.slice("/auth/v1".length), url.searchParams, body);
          return r === null ? new Response(null, { status: 204 }) : json(r);
        }
        if (url.pathname.startsWith("/storage/v1/object/")) {
          const claims = claimsFor(auth);
          const rest = decodeURIComponent(url.pathname.slice("/storage/v1/object/".length));
          if (req.method === "DELETE") {
            const { prefixes } = (await req.json()) as { prefixes: string[] };
            return json(await removeObjects(db, claims, rest, prefixes ?? []));
          }
          if (req.method === "POST" || req.method === "PUT") {
            const slash = rest.indexOf("/");
            const bucket = rest.slice(0, slash);
            const name = rest.slice(slash + 1);
            let bytes: Uint8Array;
            let mime = req.headers.get("content-type") ?? "application/octet-stream";
            if (mime.startsWith("multipart/form-data")) {
              const form = await req.formData();
              const file = [...form.values()].find((v): v is File => typeof v !== "string");
              if (!file) throw new ApiError(400, { statusCode: "400", error: "Error", message: "No file in upload" });
              bytes = new Uint8Array(await file.arrayBuffer());
              mime = file.type || mime;
            } else bytes = new Uint8Array(await req.arrayBuffer());
            return json(await uploadObject(db, claims, bucket, name, bytes, mime, req.headers.get("x-upsert") === "true"));
          }
        }
        return json({ message: `The demo backend doesn't support ${req.method} ${url.pathname}` }, 404);
      } catch (e) {
        if (e instanceof ApiError) return json(e.body, e.status);
        const { status, body } = pgErrorBody(e);
        return json(body, status);
      }
    },
  };
  return backend;
}
