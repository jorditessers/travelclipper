// Browser entry of the demo backend. Loaded lazily (only when the app first talks to "Supabase"
// in demo mode), so the database engine never weighs on normal page loads.
import { PGliteWorker } from "@electric-sql/pglite/worker";

async function memoryDb() {
  const [{ PGlite }, { pgcrypto }] = await Promise.all([import("@electric-sql/pglite"), import("@electric-sql/pglite/contrib/pgcrypto")]);
  return PGlite.create({ extensions: { pgcrypto } });
}
import { serviceClient, setupDatabase, type Backend } from "./core";
import { setDemoStatus as setStatus } from "./mode";

const MIGRATIONS = Object.entries(
  import.meta.glob("/drizzle/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
).sort(([a], [b]) => a.localeCompare(b)).map(([, sql]) => sql);

// A new schema (new migration or backend change) gets a fresh database.
const BACKEND_VERSION = 1;
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
const DB_NAME = `vellum-demo-${BACKEND_VERSION}-${hash(MIGRATIONS.join("\n"))}`;
const DB_KEY = "vellum.demoDb";
export const DEMO_AUTH_STORAGE_KEY = "sb-demo-backend-auth-token";

let backend: Promise<Backend> | null = null;

export function getBackend(): Promise<Backend> {
  if (!backend) {
    backend = (async () => {
      setStatus({ state: "preparing", step: "Loading the demo" });
      try {
        let previous: string | null = null;
        try { previous = localStorage.getItem(DB_KEY); } catch { /* storage blocked */ }
        if (previous && previous !== DB_NAME) {
          await deleteIdb(previous);
          try { localStorage.removeItem(DEMO_AUTH_STORAGE_KEY); } catch { /* ignore */ }
          previous = null;
        }
        let b: Backend;
        if (!storageAvailable()) {
          // Private windows or blocked storage: run in memory (resets on reload).
          b = await setupDatabase(await memoryDb(), MIGRATIONS, (step) => setStatus({ state: "preparing", step }));
        } else {
          // First visit: build and seed the database in memory (seconds), then persist it in one go.
          // Writing every seed query straight to IndexedDB would take minutes.
          let loadDataDir: Blob | File | undefined;
          if (previous !== DB_NAME) {
            const mem = await memoryDb();
            await setupDatabase(mem, MIGRATIONS, (step) => setStatus({ state: "preparing", step }));
            setStatus({ state: "preparing", step: "Saving the demo in your browser" });
            loadDataDir = await mem.dumpDataDir("none");
            await mem.close();
          }
          const db = await PGliteWorker.create(
            new Worker(new URL("./pglite.worker.ts", import.meta.url), { type: "module" }),
            { dataDir: `idb://${DB_NAME}`, ...(loadDataDir ? { loadDataDir } : {}) },
          );
          b = await setupDatabase(db, MIGRATIONS, (step) => setStatus({ state: "preparing", step }));
          try { localStorage.setItem(DB_KEY, DB_NAME); } catch { /* ignore */ }
        }
        setStatus({ state: "ready" });
        return b;
      } catch (e) {
        backend = null;
        setStatus({ state: "error", error: (e as Error).message });
        throw e;
      }
    })();
  }
  return backend;
}

export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return (await getBackend()).fetch(input, init);
}

function storageAvailable() {
  try {
    return typeof indexedDB !== "undefined" && !!localStorage;
  } catch {
    return false; // private windows or blocked storage: the demo runs in memory and resets on reload
  }
}

function deleteIdb(name: string) {
  return new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(`/pglite/${name}`);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

/** Wipes this browser's demo database and session, then reloads with fresh demo data. */
export async function resetLocalDemo() {
  try {
    const b = backend ? await backend : null;
    await b?.db.close();
  } catch { /* ignore */ }
  backend = null;
  await deleteIdb(DB_NAME);
  try {
    localStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem("vellum.demoTour");
  } catch { /* ignore */ }
  window.location.assign("/");
}

const blobUrls = new Map<string, string>();

/** Signed-URL stand-in: object URLs for the files the signed-in user may read. */
export async function demoSignedUrls(bucket: string, paths: string[], token: string | null | undefined) {
  const b = await getBackend();
  const files = await b.signedUrls(bucket, paths, token);
  const out = new Map<string, string>();
  for (const [name, f] of files) {
    const key = `${bucket}/${name}:${f.data.byteLength}`;
    let url = blobUrls.get(key);
    if (!url) {
      url = URL.createObjectURL(new Blob([f.data as BlobPart], { type: f.mime }));
      blobUrls.set(key, url);
    }
    out.set(name, url);
  }
  return out;
}

/** Admin "Seed demo data" / "Remove demo data" in the browser demo. */
export async function localSeedDemo() {
  const { runDemoSeed } = await import("@/lib/demo-seed-run");
  const { LOCAL_DEMO_PASSWORD } = await import("./mode");
  return runDemoSeed(serviceClient(await getBackend()), LOCAL_DEMO_PASSWORD);
}
export async function localRemoveDemo() {
  const { runRemoveDemo } = await import("@/lib/demo-seed-run");
  return runRemoveDemo(serviceClient(await getBackend()));
}

/** Tracking-link click in the browser demo (the server records clicks in the real product). */
export async function localRecordClick(code: string) {
  const { data, error } = await serviceClient(await getBackend()).rpc("record_click", {
    _code: code, _ip: `demo-visitor-${navigator.userAgent.length}`, _referrer: document.referrer ?? "", _user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
  return data as { status: string; url?: string; code?: string; attributed?: boolean };
}
