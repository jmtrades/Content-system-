// ============================================================================
// Supabase Client Setup & Database Helpers
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// ---------------------------------------------------------------------------
// Singleton clients
// ---------------------------------------------------------------------------

let browserClient: SupabaseClient | null = null;
let serverClient: SupabaseClient | null = null;

/**
 * Returns a Supabase client configured for browser / client-side usage.
 * Uses the public anon key — safe to expose in the browser.
 */
export function getBrowserClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables',
    );
  }

  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return browserClient;
}

/**
 * Returns a Supabase client configured with the service-role key.
 * This bypasses Row Level Security and should NEVER be used client-side.
 */
export function getServerClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables',
    );
  }

  if (!serverClient) {
    serverClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serverClient;
}

/**
 * Convenience alias used by API routes & engine modules.
 */
export function getDb(): SupabaseClient {
  return getServerClient();
}

// ---------------------------------------------------------------------------
// Generic helpers — thin wrappers with consistent error handling
// ---------------------------------------------------------------------------

export interface DbResult<T> {
  data: T | null;
  error: string | null;
}

/**
 * Run a SELECT query.
 *
 * @example
 *   const result = await query<RadarItem[]>('radar_items', q =>
 *     q.select('*').eq('processed', false).order('importance_score', { ascending: false }).limit(20),
 *   );
 */
export async function query<T>(
  table: string,
  builder: (q: ReturnType<SupabaseClient['from']>) => ReturnType<ReturnType<SupabaseClient['from']>['select']>,
): Promise<DbResult<T>> {
  try {
    const db = getDb();
    const { data, error } = await builder(db.from(table));

    if (error) {
      console.error(`[db:query] ${table} – ${error.message}`);
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:query] ${table} – ${message}`);
    return { data: null, error: message };
  }
}

/**
 * Insert one or more rows.
 *
 * @example
 *   const result = await insert<RadarItem>('radar_items', { title: '...', source: 'rss', ... });
 */
export async function insert<T>(
  table: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
): Promise<DbResult<T>> {
  try {
    const db = getDb();
    const { data, error } = await db
      .from(table)
      .insert(rows)
      .select();

    if (error) {
      console.error(`[db:insert] ${table} – ${error.message}`);
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:insert] ${table} – ${message}`);
    return { data: null, error: message };
  }
}

/**
 * Update rows matching a filter.
 *
 * @example
 *   const result = await update<RadarItem>('radar_items', { processed: true }, { id: itemId });
 */
export async function update<T>(
  table: string,
  values: Record<string, unknown>,
  match: Record<string, unknown>,
): Promise<DbResult<T>> {
  try {
    const db = getDb();
    let q = db.from(table).update(values);

    for (const [key, value] of Object.entries(match)) {
      q = q.eq(key, value as string | number | boolean);
    }

    const { data, error } = await q.select();

    if (error) {
      console.error(`[db:update] ${table} – ${error.message}`);
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:update] ${table} – ${message}`);
    return { data: null, error: message };
  }
}

/**
 * Delete rows matching a filter.
 *
 * @example
 *   const result = await del('radar_items', { id: itemId });
 */
export async function del<T>(
  table: string,
  match: Record<string, unknown>,
): Promise<DbResult<T>> {
  try {
    const db = getDb();
    let q = db.from(table).delete();

    for (const [key, value] of Object.entries(match)) {
      q = q.eq(key, value as string | number | boolean);
    }

    const { data, error } = await q.select();

    if (error) {
      console.error(`[db:delete] ${table} – ${error.message}`);
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:delete] ${table} – ${message}`);
    return { data: null, error: message };
  }
}

/**
 * Upsert rows (insert or update on conflict).
 *
 * @example
 *   const result = await upsert<DailyAnalytics>('daily_analytics', rows, 'platform,date');
 */
export async function upsert<T>(
  table: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
  onConflict?: string,
): Promise<DbResult<T>> {
  try {
    const db = getDb();
    const opts = onConflict ? { onConflict } : undefined;
    const { data, error } = await db
      .from(table)
      .upsert(rows, opts)
      .select();

    if (error) {
      console.error(`[db:upsert] ${table} – ${error.message}`);
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:upsert] ${table} – ${message}`);
    return { data: null, error: message };
  }
}

/**
 * Call a Supabase RPC (stored procedure / function).
 */
export async function rpc<T>(
  fnName: string,
  params?: Record<string, unknown>,
): Promise<DbResult<T>> {
  try {
    const db = getDb();
    const { data, error } = await db.rpc(fnName, params);

    if (error) {
      console.error(`[db:rpc] ${fnName} – ${error.message}`);
      return { data: null, error: error.message };
    }

    return { data: data as T, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:rpc] ${fnName} – ${message}`);
    return { data: null, error: message };
  }
}
