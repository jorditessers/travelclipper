// A small PostgREST emulator: turns the requests supabase-js sends to /rest/v1 into SQL for the
// in-browser database. It covers what this app uses: select with embedded relations and computed
// fields, the common filters, order/limit/range, counts, insert/update/upsert/delete and RPC calls.
// Every request runs as the caller's role (anon / authenticated / service_role) with its JWT claims,
// so the row level security policies from the migrations apply exactly as they would on Supabase.
import type { PGliteInterface as PGlite, Transaction } from "@electric-sql/pglite";

export type Claims = { role: "anon" | "authenticated" | "service_role"; sub?: string; email?: string; [k: string]: unknown };

type Fk = { name: string; table: string; cols: string[]; ref: string; refCols: string[] };
type Fn = { name: string; args: { name: string; type: string }[]; nDefaults: number; retset: boolean; retKind: "void" | "scalar" | "row" };
export type Meta = {
  columns: Map<string, Map<string, string>>; // table -> column -> type
  fks: Fk[];
  unique: Map<string, string[][]>; // table -> unique column sets (incl. primary key)
  pk: Map<string, string[]>;
  computed: Map<string, Set<string>>; // table -> functions taking that table's row
  fns: Map<string, Fn[]>;
};

export async function loadMeta(db: PGlite): Promise<Meta> {
  const cols = await db.query<{ t: string; c: string; ty: string }>(`
    SELECT c.relname t, a.attname c, format_type(a.atttypid, a.atttypmod) ty
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m') AND a.attnum > 0 AND NOT a.attisdropped`);
  const fks = await db.query<Fk>(`
    SELECT con.conname AS name, cl.relname AS table, array_agg(att.attname::text ORDER BY k.ord) AS cols,
           rcl.relname AS ref, array_agg(ratt.attname::text ORDER BY k.ord) AS "refCols"
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_class rcl ON rcl.oid = con.confrelid JOIN pg_namespace rn ON rn.oid = rcl.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(a, r, ord)
    JOIN pg_attribute att ON att.attrelid = cl.oid AND att.attnum = k.a
    JOIN pg_attribute ratt ON ratt.attrelid = rcl.oid AND ratt.attnum = k.r
    WHERE con.contype = 'f' AND n.nspname = 'public' AND rn.nspname = 'public'
    GROUP BY con.conname, cl.relname, rcl.relname`);
  const uniq = await db.query<{ t: string; cols: string[]; p: boolean }>(`
    SELECT cl.relname t, array_agg(att.attname::text ORDER BY att.attnum) cols, con.contype = 'p' p
    FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = cl.oid AND att.attnum = ANY (con.conkey)
    WHERE con.contype IN ('p','u') AND n.nspname = 'public' GROUP BY con.oid, cl.relname, con.contype`);
  const comp = await db.query<{ f: string; t: string }>(`
    SELECT p.proname f, c.relname t FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_type ty ON ty.oid = p.proargtypes[0] JOIN pg_class c ON c.oid = ty.typrelid
    WHERE n.nspname = 'public' AND p.pronargs = 1 AND ty.typrelid <> 0`);
  const fns = await db.query<{ f: string; names: string[] | null; types: string[]; nd: number; rs: boolean; rk: string }>(`
    SELECT p.proname f, p.proargnames[1:p.pronargs] names,
      ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) t) types, p.pronargdefaults nd, p.proretset rs,
      CASE WHEN p.prorettype = 'void'::regtype THEN 'void' WHEN rt.typtype = 'c' OR p.prorettype = 'record'::regtype THEN 'row' ELSE 'scalar' END rk
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_type rt ON rt.oid = p.prorettype
    WHERE n.nspname = 'public' AND p.prokind = 'f'`);

  const meta: Meta = { columns: new Map(), fks: fks.rows, unique: new Map(), pk: new Map(), computed: new Map(), fns: new Map() };
  for (const r of cols.rows) {
    if (!meta.columns.has(r.t)) meta.columns.set(r.t, new Map());
    meta.columns.get(r.t)!.set(r.c, r.ty);
  }
  for (const r of uniq.rows) {
    if (!meta.unique.has(r.t)) meta.unique.set(r.t, []);
    meta.unique.get(r.t)!.push(r.cols);
    if (r.p) meta.pk.set(r.t, r.cols);
  }
  for (const r of comp.rows) {
    if (!meta.computed.has(r.t)) meta.computed.set(r.t, new Set());
    meta.computed.get(r.t)!.add(r.f);
  }
  for (const r of fns.rows) {
    const f: Fn = { name: r.f, args: r.types.map((type, i) => ({ name: r.names?.[i] ?? `$${i + 1}`, type })), nDefaults: r.nd, retset: r.rs, retKind: r.rk as Fn["retKind"] };
    if (!meta.fns.has(r.f)) meta.fns.set(r.f, []);
    meta.fns.get(r.f)!.push(f);
  }
  return meta;
}

/* ------------------------------------------------------------------ helpers */

export class ApiError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) { super(String(body["message"] ?? "Error")); }
}
const bad = (message: string, code = "PGRST100", status = 400) => new ApiError(status, { code, message, details: null, hint: null });

export const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** JS value -> SQL literal, cast to `type` when given. */
export function toSql(v: unknown, type?: string): string {
  const cast = type ? `::${type}` : "";
  if (v === null || v === undefined) return `NULL${cast}`;
  if (type && /\[\]$/.test(type) && Array.isArray(v)) return `${lit(pgArray(v))}${cast}`;
  if (type && /^jsonb?$/.test(type)) return `${lit(JSON.stringify(v))}${cast}`;
  if (typeof v === "object") return `${lit(JSON.stringify(v))}${cast}`;
  return `${lit(String(v))}${cast}`;
}
function pgArray(a: unknown[]): string {
  return `{${a.map((x) => (x === null || x === undefined ? "NULL" : Array.isArray(x) ? pgArray(x) : `"${String(typeof x === "object" ? JSON.stringify(x) : x).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)).join(",")}}`;
}

/** Split on commas at parenthesis depth 0, respecting double quotes. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '"' && s[i - 1] !== "\\") q = !q;
    if (!q && ch === "(") depth++;
    if (!q && ch === ")") depth--;
    if (!q && depth === 0 && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur !== "") out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------ select */

type SelNode =
  | { kind: "star" }
  | { kind: "field"; name: string; alias?: string; cast?: string }
  | { kind: "embed"; rel: string; alias?: string; hint?: string; inner: boolean; children: SelNode[] };

function parseSelect(s: string): SelNode[] {
  return splitTop(s || "*").map((item): SelNode => {
    if (item === "*") return { kind: "star" };
    const paren = item.indexOf("(");
    if (paren > 0 && item.endsWith(")")) {
      let head = item.slice(0, paren);
      const children = parseSelect(item.slice(paren + 1, -1));
      let alias: string | undefined;
      if (head.includes(":")) [alias, head] = head.split(":", 2) as [string, string];
      const [rel, ...mods] = head.split("!");
      const inner = mods.includes("inner");
      const hint = mods.find((m) => m !== "inner" && m !== "left");
      return { kind: "embed", rel: rel!, inner, children, ...(alias ? { alias } : {}), ...(hint ? { hint } : {}) };
    }
    let name = item, alias: string | undefined, cast: string | undefined;
    if (name.includes("::")) [name, cast] = name.split("::", 2) as [string, string];
    if (name.includes(":")) [alias, name] = name.split(":", 2) as [string, string];
    return { kind: "field", name, ...(alias ? { alias } : {}), ...(cast ? { cast } : {}) };
  });
}

type Rel = { table: string; one: boolean; on: (parent: string, child: string) => string };

function resolveRel(meta: Meta, parent: string, rel: string, hint?: string): Rel {
  if (!meta.columns.has(rel)) throw bad(`Could not find a relationship between '${parent}' and '${rel}'`, "PGRST200");
  const pick = (fks: Fk[]) => (hint ? fks.filter((f) => f.name === hint || f.cols.includes(hint)) : fks)[0];
  const toOne = pick(meta.fks.filter((f) => f.table === parent && f.ref === rel));
  if (toOne) {
    return { table: rel, one: true, on: (p, c) => toOne.cols.map((col, i) => `${c}.${ident(toOne.refCols[i]!)} = ${p}.${ident(col)}`).join(" AND ") };
  }
  const toMany = pick(meta.fks.filter((f) => f.table === rel && f.ref === parent));
  if (toMany) {
    const key = [...toMany.cols].sort().join(",");
    const one = (meta.unique.get(rel) ?? []).some((u) => [...u].sort().join(",") === key);
    return { table: rel, one, on: (p, c) => toMany.cols.map((col, i) => `${c}.${ident(col)} = ${p}.${ident(toMany.refCols[i]!)}`).join(" AND ") };
  }
  throw bad(`Could not find a relationship between '${parent}' and '${rel}'`, "PGRST200");
}

/* ------------------------------------------------------------------ filters */

type Filter = { path: string[]; key: string; value: string }; // key = column, "or", "and"

function splitFilterKey(k: string): { path: string[]; key: string } {
  const parts = k.split(".");
  return { path: parts.slice(0, -1), key: parts[parts.length - 1]! };
}

class Ctx {
  n = 0;
  constructor(public meta: Meta) {}
  alias() { return `t${this.n++}`; }
}

/** Column or computed-field reference on row alias `a` of `table`. */
function colRef(ctx: Ctx, table: string, a: string, name: string, rowExpr: string): string {
  const cols = ctx.meta.columns.get(table);
  if (cols?.has(name)) return `${a}.${ident(name)}`;
  if (ctx.meta.computed.get(table)?.has(name)) return `public.${ident(name)}(${rowExpr})`;
  // json path: col->key / col->>key
  const m = name.match(/^([a-z_][a-z0-9_]*)(->>?.+)$/i);
  if (m && cols?.has(m[1]!)) return `${a}.${ident(m[1]!)}${m[2]!.replace(/->(>?)([^->]+)/g, (_s, g, k) => `->${g}${lit(k)}`)}`;
  throw bad(`column ${table}.${name} does not exist`, "42703");
}

function unquote(v: string) {
  return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v;
}

function condition(ctx: Ctx, table: string, a: string, rowExpr: string, col: string, opval: string): string {
  let neg = false;
  let rest = opval;
  if (rest.startsWith("not.")) { neg = true; rest = rest.slice(4); }
  const dot = rest.indexOf(".");
  const op = dot < 0 ? rest : rest.slice(0, dot);
  const val = dot < 0 ? "" : rest.slice(dot + 1);
  const c = colRef(ctx, table, a, col, rowExpr);
  let sql: string;
  switch (op) {
    case "eq": sql = `${c} = ${lit(val)}`; break;
    case "neq": sql = `${c} <> ${lit(val)}`; break;
    case "gt": sql = `${c} > ${lit(val)}`; break;
    case "gte": sql = `${c} >= ${lit(val)}`; break;
    case "lt": sql = `${c} < ${lit(val)}`; break;
    case "lte": sql = `${c} <= ${lit(val)}`; break;
    case "like": sql = `${c}::text LIKE ${lit(val.replace(/\*/g, "%"))}`; break;
    case "ilike": sql = `${c}::text ILIKE ${lit(val.replace(/\*/g, "%"))}`; break;
    case "is": {
      const v = val.toLowerCase();
      sql = v === "null" ? `${c} IS NULL` : v === "true" ? `${c} IS TRUE` : v === "false" ? `${c} IS FALSE` : `${c} IS UNKNOWN`;
      break;
    }
    case "in": {
      const items = splitTop(val.replace(/^\(|\)$/g, "")).map(unquote);
      sql = items.length ? `${c} IN (${items.map(lit).join(", ")})` : "false";
      break;
    }
    case "cs": sql = `${c} @> ${lit(val)}`; break;
    case "cd": sql = `${c} <@ ${lit(val)}`; break;
    case "ov": sql = `${c} && ${lit(val.startsWith("(") ? `{${val.slice(1, -1)}}` : val)}`; break;
    default: throw bad(`Unsupported filter operator '${op}' in the demo backend`);
  }
  return neg ? `NOT (${sql})` : sql;
}

/** or=(a.eq.1,and(b.gt.2,c.is.null)) */
function logic(ctx: Ctx, table: string, a: string, rowExpr: string, joiner: "OR" | "AND", body: string, negate = false): string {
  const parts = splitTop(body.replace(/^\(|\)$/g, "")).map((p) => {
    const m = p.match(/^(not\.)?(and|or)\((.*)\)$/);
    if (m) return logic(ctx, table, a, rowExpr, m[2] === "or" ? "OR" : "AND", m[3]!, !!m[1]);
    const d = p.indexOf(".");
    return condition(ctx, table, a, rowExpr, p.slice(0, d), p.slice(d + 1));
  });
  const s = `(${parts.join(` ${joiner} `)})`;
  return negate ? `NOT ${s}` : s;
}

function whereFor(ctx: Ctx, table: string, a: string, rowExpr: string, filters: Filter[]): string[] {
  return filters.map((f) => {
    if (f.key === "or" || f.key === "and") return logic(ctx, table, a, rowExpr, f.key === "or" ? "OR" : "AND", f.value);
    if (f.key === "not.or" || f.key === "not.and") return logic(ctx, table, a, rowExpr, f.key === "not.or" ? "OR" : "AND", f.value, true);
    return condition(ctx, table, a, rowExpr, f.key, f.value);
  });
}

function orderFor(ctx: Ctx, table: string, a: string, rowExpr: string, spec: string | undefined): string {
  if (!spec) return "";
  const terms = splitTop(spec).map((t) => {
    const [col, ...mods] = t.split(".");
    let s = colRef(ctx, table, a, col!, rowExpr);
    if (mods.includes("desc")) s += " DESC";
    if (mods.includes("nullsfirst")) s += " NULLS FIRST";
    if (mods.includes("nullslast")) s += " NULLS LAST";
    return s;
  });
  return terms.length ? ` ORDER BY ${terms.join(", ")}` : "";
}

type Scoped = { filters: Filter[]; order?: string; limit?: string; offset?: string };

function scoped(all: Map<string, Scoped>, path: string[]) {
  const k = path.join(".");
  if (!all.has(k)) all.set(k, { filters: [] });
  return all.get(k)!;
}

/** jsonb expression for one row `a` of `table` (+ EXISTS conditions for !inner embeds). */
function rowJson(ctx: Ctx, table: string, a: string, rowExpr: string, nodes: SelNode[], path: string[], params: Map<string, Scoped>): { expr: string; inner: string[] } {
  const pieces: string[] = [];
  const pairs: string[] = [];
  const inner: string[] = [];
  for (const n of nodes) {
    if (n.kind === "star") pieces.push(`to_jsonb(${a})`);
    else if (n.kind === "field") {
      let e = colRef(ctx, table, a, n.name, rowExpr);
      if (n.cast) e = `(${e})::${n.cast}`;
      pairs.push(`${lit(n.alias ?? n.name.replace(/^.*->>?/, ""))}, ${e}`);
    } else {
      const rel = resolveRel(ctx.meta, table, n.rel, n.hint);
      const childPath = [...path, n.alias ?? n.rel];
      const sc = params.get(childPath.join(".")) ?? params.get([...path, n.rel].join(".")) ?? { filters: [] };
      const c = ctx.alias();
      const child = rowJson(ctx, rel.table, c, c, n.children, childPath, params);
      const where = [rel.on(a, c), ...whereFor(ctx, rel.table, c, c, sc.filters), ...child.inner].join(" AND ");
      const from = `FROM public.${ident(rel.table)} ${c} WHERE ${where}`;
      const ord = orderFor(ctx, rel.table, c, c, sc.order);
      const lim = sc.limit ? ` LIMIT ${Number(sc.limit)}` : "";
      const off = sc.offset ? ` OFFSET ${Number(sc.offset)}` : "";
      const sub = rel.one
        ? `(SELECT ${child.expr} ${from}${ord} LIMIT 1)`
        : `coalesce((SELECT jsonb_agg(x.r) FROM (SELECT ${child.expr} AS r ${from}${ord}${lim}${off}) x), '[]'::jsonb)`;
      pairs.push(`${lit(n.alias ?? n.rel)}, ${sub}`);
      if (n.inner) inner.push(`EXISTS (SELECT 1 ${from})`);
    }
  }
  for (let i = 0; i < pairs.length; i += 40) pieces.push(`jsonb_build_object(${pairs.slice(i, i + 40).join(", ")})`);
  return { expr: pieces.length ? pieces.join(" || ") : "'{}'::jsonb", inner };
}

/* ------------------------------------------------------------------ request handling */

export type RestRequest = { method: string; path: string; params: URLSearchParams; headers: Headers; body: unknown };
export type RestResult = { status: number; body?: unknown; headers?: Record<string, string> };

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function collect(params: URLSearchParams) {
  const map = new Map<string, Scoped>();
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    const { path, key } = splitFilterKey(k);
    if (key === "order" || key === "limit" || key === "offset") { scoped(map, path)[key] = v; continue; }
    if (key === "or" || key === "and") { scoped(map, path).filters.push({ path, key, value: v }); continue; }
    // "not.or=(...)"
    if (path[path.length - 1] === "not" && (key === "or" || key === "and")) continue;
    scoped(map, path).filters.push({ path, key, value: v });
  }
  const top = scoped(map, []);
  if (params.has("order")) top.order = params.get("order")!;
  if (params.has("limit")) top.limit = params.get("limit")!;
  if (params.has("offset")) top.offset = params.get("offset")!;
  return map;
}

function prefer(h: Headers) {
  const p = (h.get("prefer") ?? "").split(",").map((x) => x.trim());
  return {
    representation: p.includes("return=representation"),
    count: p.find((x) => x.startsWith("count="))?.slice(6),
    merge: p.includes("resolution=merge-duplicates"),
    ignore: p.includes("resolution=ignore-duplicates"),
    missingDefault: p.includes("missing=default"),
  };
}

const wantsObject = (h: Headers) => (h.get("accept") ?? "").includes("application/vnd.pgrst.object+json");

function shape(rows: unknown[], h: Headers, status: number, extraHeaders: Record<string, string> = {}): RestResult {
  if (wantsObject(h)) {
    if (rows.length !== 1) {
      throw new ApiError(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null });
    }
    return { status, body: rows[0], headers: extraHeaders };
  }
  return { status, body: rows, headers: extraHeaders };
}

export async function handleRest(db: PGlite, meta: Meta, claims: Claims, req: RestRequest): Promise<RestResult> {
  const m = req.path.match(/^\/(rpc\/)?([A-Za-z0-9_]+)$/);
  if (!m) throw bad("Not found", "PGRST125", 404);
  return runAs(db, claims, async (tx) => (m[1] ? rpc(tx, meta, m[2]!, req) : table(tx, meta, m[2]!, req)));
}

export async function runAs<T>(db: PGlite, claims: Claims, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${claims.role}; SELECT set_config('request.jwt.claims', ${lit(JSON.stringify(claims))}, true);`);
    return fn(tx);
  });
}

async function table(tx: Transaction, meta: Meta, name: string, req: RestRequest): Promise<RestResult> {
  if (!meta.columns.has(name)) throw bad(`Could not find the table 'public.${name}' in the schema cache`, "PGRST205", 404);
  const ctx = new Ctx(meta);
  const params = collect(req.params);
  const top = params.get("")!;
  const pref = prefer(req.headers);
  const nodes = parseSelect(req.params.get("select") ?? "*");
  const method = req.method.toUpperCase();

  if (method === "GET" || method === "HEAD") {
    const a = ctx.alias();
    const row = rowJson(ctx, name, a, a, nodes, [], params);
    const where = [...whereFor(ctx, name, a, a, top.filters), ...row.inner];
    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const ord = orderFor(ctx, name, a, a, top.order);
    const lim = top.limit ? ` LIMIT ${Number(top.limit)}` : "";
    const off = top.offset ? ` OFFSET ${Number(top.offset)}` : "";
    const headers: Record<string, string> = {};
    let rows: unknown[] = [];
    if (method === "GET") rows = (await tx.query<{ r: unknown }>(`SELECT ${row.expr} AS r FROM public.${ident(name)} ${a}${w}${ord}${lim}${off}`)).rows.map((x) => x.r);
    const start = Number(top.offset ?? 0);
    if (pref.count) {
      const total = (await tx.query<{ n: number }>(`SELECT count(*)::int n FROM public.${ident(name)} ${a}${w}`)).rows[0]!.n;
      headers["content-range"] = rows.length ? `${start}-${start + rows.length - 1}/${total}` : `*/${total}`;
    } else headers["content-range"] = rows.length ? `${start}-${start + rows.length - 1}/*` : "*/*";
    return method === "HEAD" ? { status: 200, headers } : shape(rows, req.headers, 200, headers);
  }

  const cols = meta.columns.get(name)!;
  const returning = async (cte: string) => {
    const a = ctx.alias();
    const rowExpr = `(ROW(${a}.*)::public.${ident(name)})`;
    const row = rowJson(ctx, name, a, rowExpr, nodes, [], params);
    return (await tx.query<{ r: unknown }>(`WITH m AS (${cte}) SELECT ${row.expr} AS r FROM m ${a}`)).rows.map((x) => x.r);
  };

  if (method === "POST") {
    const list = (Array.isArray(req.body) ? req.body : [req.body]) as Record<string, unknown>[];
    if (!list.length) return shape([], req.headers, 201);
    const keys = req.params.get("columns")?.split(",").map((c) => c.replace(/"/g, "").trim()) ?? [...new Set(list.flatMap((r) => Object.keys(r)))];
    for (const k of keys) if (!cols.has(k)) throw bad(`Could not find the '${k}' column of '${name}' in the schema cache`, "PGRST204");
    const colList = keys.map(ident).join(", ");
    let sql = `INSERT INTO public.${ident(name)} (${colList}) SELECT ${colList} FROM jsonb_populate_recordset(NULL::public.${ident(name)}, ${lit(JSON.stringify(list))}::jsonb)`;
    if (pref.merge || pref.ignore) {
      const target = req.params.get("on_conflict")?.split(",").map((c) => c.trim()) ?? meta.pk.get(name) ?? [];
      const upd = keys.filter((k) => !target.includes(k));
      sql += ` ON CONFLICT (${target.map(ident).join(", ")}) ` + (pref.ignore || !upd.length ? "DO NOTHING" : `DO UPDATE SET ${upd.map((k) => `${ident(k)} = EXCLUDED.${ident(k)}`).join(", ")}`);
    }
    const rows = await returning(`${sql} RETURNING *`);
    return pref.representation ? shape(rows, req.headers, 201) : { status: 201 };
  }

  if (method === "PATCH") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const keys = Object.keys(body);
    for (const k of keys) if (!cols.has(k)) throw bad(`Could not find the '${k}' column of '${name}' in the schema cache`, "PGRST204");
    const a = ctx.alias();
    const where = whereFor(ctx, name, a, a, top.filters);
    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    if (!keys.length) return pref.representation ? shape([], req.headers, 200) : { status: 204 };
    const colList = keys.map(ident).join(", ");
    const set = `(${colList}) = (SELECT ${colList} FROM jsonb_populate_record(NULL::public.${ident(name)}, ${lit(JSON.stringify(body))}::jsonb))`;
    const rows = await returning(`UPDATE public.${ident(name)} ${a} SET ${keys.length === 1 ? `${colList} = (SELECT ${colList} FROM jsonb_populate_record(NULL::public.${ident(name)}, ${lit(JSON.stringify(body))}::jsonb))` : set}${w} RETURNING ${a}.*`);
    return pref.representation ? shape(rows, req.headers, 200) : { status: 204 };
  }

  if (method === "DELETE") {
    const a = ctx.alias();
    const where = whereFor(ctx, name, a, a, top.filters);
    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const rows = await returning(`DELETE FROM public.${ident(name)} ${a}${w} RETURNING ${a}.*`);
    return pref.representation ? shape(rows, req.headers, 200) : { status: 204 };
  }
  throw bad(`Method ${method} not supported`, "PGRST117", 405);
}

async function rpc(tx: Transaction, meta: Meta, name: string, req: RestRequest): Promise<RestResult> {
  const candidates = meta.fns.get(name);
  if (!candidates?.length) throw bad(`Could not find the function public.${name} in the schema cache`, "PGRST202", 404);
  const args: Record<string, unknown> = req.method === "GET" ? Object.fromEntries(req.params) : ((req.body ?? {}) as Record<string, unknown>);
  const given = Object.keys(args);
  const fn = candidates.find((f) => given.every((g) => f.args.some((x) => x.name === g)) && f.args.slice(0, f.args.length - f.nDefaults).every((x) => given.includes(x.name)))
    ?? candidates.find((f) => given.every((g) => f.args.some((x) => x.name === g)));
  if (!fn) throw bad(`Could not find the function public.${name}(${given.join(", ")}) in the schema cache`, "PGRST202", 404);
  const call = `public.${ident(name)}(${fn.args.filter((x) => given.includes(x.name)).map((x) => `${ident(x.name)} => ${toSql(args[x.name], x.type)}`).join(", ")})`;

  if (fn.retKind === "void") {
    await tx.query(`SELECT ${call}`);
    return { status: 204 };
  }
  if (fn.retset || fn.retKind === "row") {
    const ctx = new Ctx(meta);
    const top = collect(req.method === "GET" ? new URLSearchParams() : req.params).get("")!;
    const rows = (await tx.query<{ r: Record<string, unknown> }>(`SELECT to_jsonb(x) AS r FROM ${call} x`)).rows.map((x) => x.r);
    // Filters/order on RPC results (rare): applied in JS on the returned rows.
    let out = rows;
    if (top.filters.length) out = out.filter((r) => top.filters.every((f) => jsFilter(r, f)));
    void ctx;
    if (top.limit) out = out.slice(Number(top.offset ?? 0), Number(top.offset ?? 0) + Number(top.limit));
    if (!fn.retset) return { status: 200, body: out[0] ?? null };
    return shape(out, req.headers, 200);
  }
  const r = (await tx.query<{ r: unknown }>(`SELECT to_jsonb(${call}) AS r`)).rows[0]?.r ?? null;
  return { status: 200, body: r };
}

function jsFilter(row: Record<string, unknown>, f: Filter): boolean {
  const [op, ...rest] = f.value.split(".");
  const v = rest.join(".");
  const x = row[f.key];
  switch (op) {
    case "eq": return String(x) === v;
    case "neq": return String(x) !== v;
    case "is": return v === "null" ? x === null : String(x) === v;
    case "in": return splitTop(v.replace(/^\(|\)$/g, "")).map(unquote).includes(String(x));
    default: return true;
  }
}
