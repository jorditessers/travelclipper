// Minimal GoTrue (Supabase Auth) emulator for the in-browser demo: email + password accounts,
// sessions with access/refresh tokens, and the admin endpoints the demo seed uses.
// Accounts only exist in this browser, so tokens are unsigned and passwords are stored as SHA-256.
import type { PGliteInterface as PGlite } from "@electric-sql/pglite";
import { ApiError, lit, type Claims } from "./postgrest";

const TOKEN_TTL = 3600;

type UserRow = {
  id: string; email: string; email_confirmed_at: string | null; raw_app_meta_data: Record<string, unknown>;
  raw_user_meta_data: Record<string, unknown>; last_sign_in_at: string | null; created_at: string; updated_at: string;
};

const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const p = token.split(".")[1];
    return p ? JSON.parse(fromB64url(p)) : null;
  } catch {
    return null;
  }
}

function sign(user: UserRow): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + TOKEN_TTL,
    app_metadata: user.raw_app_meta_data, user_metadata: user.raw_user_meta_data, session_id: crypto.randomUUID(), is_anonymous: false,
  }));
  return `${header}.${payload}.demo-signature`;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));

export function userJson(u: UserRow) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: iso(u.email_confirmed_at),
    confirmed_at: iso(u.email_confirmed_at), phone: "", last_sign_in_at: iso(u.last_sign_in_at),
    app_metadata: u.raw_app_meta_data, user_metadata: u.raw_user_meta_data, identities: [],
    created_at: iso(u.created_at), updated_at: iso(u.updated_at), is_anonymous: false,
  };
}

const authError = (status: number, error_code: string, msg: string) => new ApiError(status, { code: status, error_code, msg, message: msg });
const hash = (pw: string) => `encode(sha256(convert_to(${lit(pw)}, 'UTF8')), 'hex')`;
const USER_COLS = "id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, last_sign_in_at, created_at, updated_at";

async function session(db: PGlite, user: UserRow) {
  const refresh = crypto.randomUUID().replace(/-/g, "");
  await db.query(`INSERT INTO auth.refresh_tokens (token, user_id) VALUES (${lit(refresh)}, ${lit(user.id)})`);
  await db.query(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = ${lit(user.id)}`);
  return {
    access_token: sign(user), token_type: "bearer", expires_in: TOKEN_TTL,
    expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL, refresh_token: refresh, user: userJson(user),
  };
}

async function findUser(db: PGlite, where: string): Promise<UserRow | null> {
  return (await db.query<UserRow>(`SELECT ${USER_COLS} FROM auth.users WHERE ${where}`)).rows[0] ?? null;
}

function validPassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 6) throw authError(422, "weak_password", "Password should be at least 6 characters.");
  return pw;
}

export async function createUser(db: PGlite, email: string, password: string, meta: Record<string, unknown> = {}): Promise<UserRow> {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw authError(400, "validation_failed", "Unable to validate email address: invalid format");
  if (await findUser(db, `email = ${lit(e)}`)) throw authError(422, "user_already_exists", "User already registered");
  return (await db.query<UserRow>(`INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
    VALUES (${lit(e)}, ${hash(validPassword(password))}, now(), ${lit(JSON.stringify(meta))}::jsonb) RETURNING ${USER_COLS}`)).rows[0]!;
}

export async function handleAuth(db: PGlite, claims: Claims | null, method: string, path: string, params: URLSearchParams, body: Record<string, unknown>) {
  const M = method.toUpperCase();

  if (M === "POST" && path === "/token") {
    const grant = params.get("grant_type");
    if (grant === "password") {
      const email = String(body["email"] ?? "").trim().toLowerCase();
      const u = await findUser(db, `email = ${lit(email)} AND encrypted_password = ${hash(String(body["password"] ?? ""))}`);
      if (!u) throw authError(400, "invalid_credentials", "Invalid login credentials");
      return session(db, u);
    }
    if (grant === "refresh_token") {
      const t = String(body["refresh_token"] ?? "");
      const r = (await db.query<{ user_id: string }>(`DELETE FROM auth.refresh_tokens WHERE token = ${lit(t)} RETURNING user_id`)).rows[0];
      const u = r && (await findUser(db, `id = ${lit(r.user_id)}`));
      if (!u) throw authError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      return session(db, u);
    }
    throw authError(400, "unsupported_grant_type", "Unsupported grant type");
  }

  if (M === "POST" && path === "/signup") {
    const u = await createUser(db, String(body["email"] ?? ""), String(body["password"] ?? ""), (body["data"] as Record<string, unknown>) ?? {});
    return session(db, u); // demo accounts are confirmed right away
  }

  if (M === "POST" && path === "/recover") {
    throw authError(400, "email_provider_disabled", "Password reset emails aren't sent in the demo. Create a new account instead.");
  }
  if (M === "POST" && path === "/logout") return null;

  if (path === "/user") {
    if (!claims?.sub) throw authError(401, "no_authorization", "This endpoint requires a valid Bearer token");
    const u = await findUser(db, `id = ${lit(claims.sub)}`);
    if (!u) throw authError(403, "user_not_found", "User from sub claim in JWT does not exist");
    if (M === "GET") return userJson(u);
    if (M === "PUT") {
      const sets: string[] = ["updated_at = now()"];
      if (body["password"] !== undefined) {
        if (await findUser(db, `id = ${lit(u.id)} AND encrypted_password = ${hash(validPassword(body["password"]))}`)) {
          throw authError(422, "same_password", "New password should be different from the old password.");
        }
        sets.push(`encrypted_password = ${hash(String(body["password"]))}`);
      }
      if (body["email"] !== undefined) throw authError(400, "email_change_disabled", "Changing the email address isn't available in the demo.");
      if (body["data"]) sets.push(`raw_user_meta_data = raw_user_meta_data || ${lit(JSON.stringify(body["data"]))}::jsonb`);
      const nu = (await db.query<UserRow>(`UPDATE auth.users SET ${sets.join(", ")} WHERE id = ${lit(u.id)} RETURNING ${USER_COLS}`)).rows[0]!;
      return userJson(nu);
    }
  }

  if (path.startsWith("/admin/users")) {
    if (claims?.role !== "service_role") throw authError(403, "not_admin", "User not allowed");
    const id = path.split("/")[3];
    if (M === "GET" && !id) {
      const page = Math.max(1, Number(params.get("page") ?? 1));
      const per = Math.min(1000, Math.max(1, Number(params.get("per_page") ?? 50)));
      const rows = (await db.query<UserRow>(`SELECT ${USER_COLS} FROM auth.users ORDER BY created_at, id LIMIT ${per} OFFSET ${(page - 1) * per}`)).rows;
      return { users: rows.map(userJson), aud: "authenticated" };
    }
    if (M === "POST" && !id) {
      return userJson(await createUser(db, String(body["email"] ?? ""), String(body["password"] ?? ""), (body["user_metadata"] as Record<string, unknown>) ?? {}));
    }
    if (id && M === "GET") {
      const u = await findUser(db, `id = ${lit(id)}`);
      if (!u) throw authError(404, "user_not_found", "User not found");
      return userJson(u);
    }
    if (id && M === "PUT") {
      const sets = ["updated_at = now()"];
      if (body["password"] !== undefined) sets.push(`encrypted_password = ${hash(validPassword(body["password"]))}`);
      if (body["email"] !== undefined) sets.push(`email = ${lit(String(body["email"]).toLowerCase())}`);
      const u = (await db.query<UserRow>(`UPDATE auth.users SET ${sets.join(", ")} WHERE id = ${lit(id)} RETURNING ${USER_COLS}`)).rows[0];
      if (!u) throw authError(404, "user_not_found", "User not found");
      return userJson(u);
    }
    if (id && M === "DELETE") {
      await db.query(`DELETE FROM auth.users WHERE id = ${lit(id)}`);
      return {};
    }
  }
  throw authError(404, "not_found", `Auth endpoint ${M} ${path} isn't available in the demo`);
}
