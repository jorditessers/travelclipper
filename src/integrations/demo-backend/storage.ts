// Supabase Storage stand-in: files live in storage.objects (bytea) in the local database and the
// storage policies from the migrations decide who may upload, read or delete them.
import type { PGliteInterface as PGlite } from "@electric-sql/pglite";
import { ApiError, lit, runAs, type Claims } from "./postgrest";

const storageError = (status: number, message: string) => new ApiError(status, { statusCode: String(status), error: "Error", message });

export async function uploadObject(db: PGlite, claims: Claims, bucket: string, name: string, bytes: Uint8Array, mime: string, upsert: boolean) {
  const meta = JSON.stringify({ size: bytes.byteLength, mimetype: mime });
  try {
    return await runAs(db, claims, async (tx) => {
      const sql = `INSERT INTO storage.objects (bucket_id, name, owner, metadata, data) VALUES ($1, $2, auth.uid(), $3::jsonb, $4)`
        + (upsert ? " ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata, data = EXCLUDED.data, updated_at = now()" : "")
        + " RETURNING id";
      const r = await tx.query<{ id: string }>(sql, [bucket, name, meta, bytes]);
      return { Key: `${bucket}/${name}`, Id: r.rows[0]!.id };
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (/row-level security/i.test(msg)) throw storageError(403, "new row violates row-level security policy");
    if (/duplicate key/i.test(msg)) throw storageError(409, "The resource already exists");
    throw e;
  }
}

export async function removeObjects(db: PGlite, claims: Claims, bucket: string, names: string[]) {
  if (!names.length) return [];
  return runAs(db, claims, async (tx) => (await tx.query(
    `DELETE FROM storage.objects WHERE bucket_id = ${lit(bucket)} AND name IN (${names.map(lit).join(", ")})
     RETURNING id, bucket_id, name, owner, metadata, created_at, updated_at`)).rows);
}

/** Files the caller may read (RLS applies), as bytes. */
export async function readObjects(db: PGlite, claims: Claims, bucket: string, names: string[]) {
  if (!names.length) return new Map<string, { data: Uint8Array; mime: string }>();
  const rows = await runAs(db, claims, async (tx) => (await tx.query<{ name: string; data: Uint8Array; mime: string }>(
    `SELECT name, data, coalesce(metadata ->> 'mimetype', 'application/octet-stream') AS mime FROM storage.objects
     WHERE bucket_id = ${lit(bucket)} AND name IN (${names.map(lit).join(", ")})`)).rows);
  return new Map(rows.map((r) => [r.name, { data: r.data, mime: r.mime }]));
}
