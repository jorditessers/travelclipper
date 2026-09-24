import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';
import { DEMO_ANON_KEY, DEMO_SUPABASE_URL } from '@/integrations/demo-backend/mode';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}


export const NOT_CONFIGURED_MESSAGE = "Accounts and data aren't available in this preview yet.";

/** False when the site runs without a database (no Supabase variables set). */
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env['VITE_SUPABASE_URL'] || (typeof process !== 'undefined' ? process.env['SUPABASE_URL'] : undefined);
  const key = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || (typeof process !== 'undefined' ? process.env['SUPABASE_PUBLISHABLE_KEY'] : undefined);
  return !!(url && key);
}

// Without a database every request answers with a readable error instead of crashing the page,
// so public pages keep working and data features show a friendly message.
const notConfiguredFetch: typeof fetch = async () =>
  new Response(JSON.stringify({ message: NOT_CONFIGURED_MESSAGE, msg: NOT_CONFIGURED_MESSAGE, code: 'not_configured' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });

function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const env = typeof process !== 'undefined' ? process.env : {};
  const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || env['SUPABASE_URL'];
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || env['SUPABASE_PUBLISHABLE_KEY'];

  if ((!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) && !import.meta.env.SSR && typeof window !== 'undefined') {
    return createLocalDemoClient();
  }
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.warn('[Supabase] No database connected (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY not set). Running without accounts and data.');
    return createClient<Database>('https://not-configured.invalid', 'not-configured', {
      global: { fetch: notConfiguredFetch },
      auth: { storage: brokeredPreviewStorage(), persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: brokeredPreviewStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

/**
 * No Supabase project configured: the browser runs the demo backend (a PostgreSQL database in the
 * visitor's browser, see src/integrations/demo-backend). Loaded on first use only.
 */
function createLocalDemoClient() {
  const client = createClient<Database>(DEMO_SUPABASE_URL, DEMO_ANON_KEY, {
    global: {
      fetch: async (input, init) => (await import('@/integrations/demo-backend')).demoFetch(input, init),
    },
    auth: { storage: localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  // Signed URLs point at files inside the local database: hand out object URLs instead.
  const from = client.storage.from.bind(client.storage);
  const token = async () => (await client.auth.getSession()).data.session?.access_token;
  client.storage.from = ((bucket: string) => {
    const api = from(bucket);
    api.createSignedUrls = (async (paths: string[]) => {
      const { demoSignedUrls } = await import('@/integrations/demo-backend');
      const urls = await demoSignedUrls(bucket, paths, await token());
      return { data: paths.map((path) => ({ path, signedUrl: urls.get(path) ?? '', signedURL: urls.get(path) ?? '', error: urls.has(path) ? null : 'Object not found' })), error: null };
    }) as typeof api.createSignedUrls;
    api.createSignedUrl = (async (path: string) => {
      const { demoSignedUrls } = await import('@/integrations/demo-backend');
      const url = (await demoSignedUrls(bucket, [path], await token())).get(path);
      return url ? { data: { signedUrl: url }, error: null } : { data: null, error: new Error('Object not found') };
    }) as typeof api.createSignedUrl;
    return api;
  }) as typeof client.storage.from;
  return client;
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

