import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

export const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const clone = (value) => JSON.parse(JSON.stringify(value));
const ident = (value) => {
  if (!/^[a-z_][a-z_0-9]*$/i.test(value)) throw new Error(`Unsupported SQL identifier: ${value}`);
  return `"${value}"`;
};

export async function createDatabase(directory) {
  const db = new PGlite(directory);
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant all on storage.objects to authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  `);
  const applied = [], excluded = [];
  for (const file of readdirSync(path.join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort()) {
    if (file.startsWith('0002')) { excluded.push({ file, reason: 'Hosted pg_cron/pg_net scheduling requires the Supabase platform.' }); continue; }
    const sql = readFileSync(path.join(root, 'supabase/migrations', file), 'utf8').replace('create extension if not exists "pgcrypto";', '');
    await db.exec(sql);
    applied.push(file);
  }
  await db.exec(`create schema simulation;
    create table simulation.browser_snapshots(user_id uuid primary key references auth.users(id), data jsonb not null);
    create table simulation.results(name text primary key, status text not null, details jsonb not null);
    create table simulation.run_config(id boolean primary key default true check(id), config jsonb not null);`);
  return { db, applied, excluded };
}

// Each request gets its own transaction and role, so concurrent virtual users cannot share session claims.
export function createClient(db, { userId = null, admin = false, invoke, files = new Map() } = {}) {
  const role = admin ? 'service_role' : userId ? 'authenticated' : 'anon';
  const execute = async (sql, params = []) => db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [userId ?? '']);
    return tx.query(sql, params);
  });
  const client = {
    auth: { async getUser(token) {
      if (!userId || (token && token !== `sim-${userId}`)) return { data: { user: null }, error: { message: 'Invalid simulated session' } };
      const { rows } = await db.query('select id,email,raw_user_meta_data as user_metadata from auth.users where id=$1', [userId]);
      return { data: { user: rows[0] ?? null }, error: rows.length ? null : { message: 'Unknown simulated user' } };
    } },
    functions: { invoke: async (name, options = {}) => {
      if (!invoke) throw new Error('No simulated Edge runtime');
      const response = await invoke(name, userId, options.body);
      if (!response.ok) return { data: null, error: { message: (await response.json()).error, context: response } };
      return { data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.blob(), error: null };
    } },
    async rpc(name, args) {
      try {
        const result = await execute(`select public.${ident(name)}(${Object.keys(args).map((key, i) => `${ident(key)} => $${i + 1}`).join(',')}) as value`, Object.values(args));
        return { data: result.rows[0].value, error: null };
      } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
    },
    from(table) {
      ident(table);
      let action = 'select', columns = '*', returning = false, payload, options = {}, first = 0, take = null, single = false, maybe = false;
      const filters = [], orders = [];
      const q = {
        select(value = '*') { columns = value; returning = true; return q; },
        eq(key, value) { filters.push([key, '=', value]); return q; },
        neq(key, value) { filters.push([key, '<>', value]); return q; },
        gte(key, value) { filters.push([key, '>=', value]); return q; },
        lt(key, value) { filters.push([key, '<', value]); return q; },
        lte(key, value) { filters.push([key, '<=', value]); return q; },
        in(key, values) { filters.push([key, 'in', values]); return q; },
        not(key, operator, value) { if (operator !== 'is' || value !== null) throw new Error('Unsupported not filter'); filters.push([key, 'is not null']); return q; },
        order(key, opts = {}) { orders.push(`${ident(key)} ${opts.ascending === false ? 'desc' : 'asc'}`); return q; },
        range(start, end) { first = start; take = end - start + 1; return q; },
        limit(count) { take = count; return q; },
        insert(value) { action = 'insert'; payload = value; return q; },
        upsert(value, opts = {}) { action = 'upsert'; payload = value; options = opts; return q; },
        update(value) { action = 'update'; payload = value; return q; },
        delete() { action = 'delete'; return q; },
        maybeSingle() { maybe = true; return q; },
        single() { single = true; return q; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      async function run() {
        const params = [];
        const bind = (value) => { params.push(value && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : value); return `$${params.length}`; };
        const selected = columns === '*' ? '*' : columns.split(',').map((column) => ident(column.trim())).join(',');
        const where = () => !filters.length ? '' : ' where ' + filters.map(([key, op, value]) =>
          op === 'is not null' ? `${ident(key)} is not null` : op === 'in' ? (value.length ? `${ident(key)} in (${value.map(bind).join(',')})` : 'false') : `${ident(key)} ${op} ${bind(value)}`).join(' and ');
        try {
          let sql;
          if (action === 'select') sql = `select ${selected} from public.${ident(table)}${where()}${orders.length ? ' order by ' + orders.join(',') : ''}${take === null ? '' : ` limit ${Number(take)} offset ${Number(first)}`}`;
          if (action === 'delete') sql = `delete from public.${ident(table)}${where()}`;
          if (action === 'update') sql = `update public.${ident(table)} set ${Object.entries(payload).map(([key, value]) => `${ident(key)}=${bind(value)}`).join(',')}${where()}`;
          if (action === 'insert' || action === 'upsert') {
            const rows = Array.isArray(payload) ? payload : [payload];
            if (!rows.length) return { data: [], error: null };
            const keys = [...new Set(rows.flatMap(Object.keys))];
            sql = `insert into public.${ident(table)} (${keys.map(ident).join(',')}) values ` + rows.map((row) => `(${keys.map((key) => key in row ? bind(row[key]) : 'default').join(',')})`).join(',');
            if (action === 'upsert') {
              const conflict = (options.onConflict ?? (table === 'drive_connections' || table === 'user_preferences' ? 'user_id' : 'id')).split(',');
              const updates = keys.filter((key) => !conflict.includes(key));
              sql += ` on conflict (${conflict.map(ident).join(',')}) do ` + (options.ignoreDuplicates || !updates.length ? 'nothing' : 'update set ' + updates.map((key) => `${ident(key)}=excluded.${ident(key)}`).join(','));
            }
          }
          if (action !== 'select' && returning) sql += ' returning ' + selected;
          const { rows } = await execute(sql, params);
          if ((single && rows.length !== 1) || (maybe && rows.length > 1)) throw new Error('Unexpected single-row result');
          return { data: clone(single || maybe ? rows[0] ?? null : rows), error: null };
        } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
      }
      return q;
    },
    storage: { from(bucket) { return {
      async upload(name, file) {
        try {
          const { rows: [policy] } = await db.query('select * from storage.buckets where id=$1', [bucket]);
          if (!policy || file.size > policy.file_size_limit || !policy.allowed_mime_types.includes(file.type)) throw new Error('Invalid storage file');
          await execute('insert into storage.objects(bucket_id,name) values ($1,$2)', [bucket, name]);
          files.set(`${bucket}/${name}`, new Uint8Array(await file.arrayBuffer()));
          return { data: { path: name }, error: null };
        } catch (error) { return { data: null, error: { message: error.message } }; }
      },
      async remove(names) {
        for (const name of names) {
          const result = await execute('delete from storage.objects where bucket_id=$1 and name=$2 returning name', [bucket, name]);
          if (result.rows.length) files.delete(`${bucket}/${name}`);
        }
        return { data: [], error: null };
      },
    }; } },
  };
  return client;
}

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key),
    clear: () => values.clear(), snapshot: () => Object.fromEntries(values) };
}

export function moduleLoader(globals = {}, intercept = () => undefined) {
  const context = vm.createContext({ console, Date, Map, Set, Event, CustomEvent, crypto, TextEncoder, TextDecoder,
    URL, URLSearchParams, Request, Response, Headers, File, Blob, FormData, AbortSignal, Uint8Array, atob, btoa, ...globals });
  const cache = new Map();
  function load(filename) {
    if (!path.extname(filename)) filename += '.ts';
    const replacement = intercept(filename);
    if (replacement) return replacement;
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} };
    cache.set(filename, loaded);
    const source = readFileSync(filename, 'utf8').replaceAll('import.meta.main', 'false');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(
      (name) => intercept(name) ?? (name.startsWith('.') ? load(path.resolve(path.dirname(filename), name)) : name.startsWith('@/') ? load(path.join(root, 'src', name.slice(2))) : require(name)), loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}

export function createBrowser(client, userId) {
  const window = new EventTarget();
  Object.assign(window, { localStorage: memoryStorage(), sessionStorage: memoryStorage(), setTimeout: () => 1, clearTimeout: () => {} });
  const load = moduleLoader({ window }, (name) => /(?:supabase-client|supabase[\\/]client)(?:\.ts)?$/.test(name)
    ? { getSupabaseBrowserClient: () => client, getSupabaseClient: () => client, isSupabaseConfigured: true } : undefined);
  const lib = (name) => load(path.join(root, 'src/lib', name));
  const local = lib('private-storage');
  local.setStorageUser(userId);
  return { lib, window, local, set: (key, value) => local.privateStorage.setItem(key, JSON.stringify(value)),
    get: (key) => JSON.parse(local.privateStorage.getItem(key) ?? 'null') };
}
