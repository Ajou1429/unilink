import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migrations = ["0010_core_learning.sql", "0011_p0_schedules.sql", "0012_p0_planning_execution.sql"];
const db = new PGlite();
const escapeCell = value => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function public.set_updated_at() returns trigger language plpgsql as
      $$ begin new.updated_at = now(); return new; end; $$;
  `);
  for (const file of migrations) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const out = ["# P0 Column Dictionary", "", "Generated from the P0 migrations by `node scripts/export-p0-dictionary.mjs`.",
    "See [P0 implementation decisions](p0-database.md) for scope, migration assumptions and deferred application behavior.", "",
    "All timestamp defaults use `now()`. UUID keys use `gen_random_uuid()`. Mutable tables have an updated_at trigger.",
    "Authenticated users receive SELECT/INSERT/UPDATE/DELETE on their own rows, except study_methods (read only). Anonymous access is revoked.", ""];
  for (const { tablename } of tables) {
    out.push(`## ${tablename}`, "", "| Column | Type | Nullable | Default / generated expression |", "| --- | --- | --- | --- |");
    const columns = (await db.query(`select column_name, data_type, udt_name, numeric_precision, numeric_scale,
      is_nullable, column_default, generation_expression from information_schema.columns
      where table_schema='public' and table_name=$1 order by ordinal_position`, [tablename])).rows;
    for (const c of columns) {
      const type = c.data_type === "numeric" ? `numeric(${c.numeric_precision},${c.numeric_scale})` : c.data_type;
      out.push(`| ${c.column_name} | ${type} | ${c.is_nullable} | ${escapeCell(c.generation_expression || c.column_default || "-")} |`);
    }
    out.push("", "Constraints:", "");
    const constraints = (await db.query(`select conname,pg_get_constraintdef(oid) as definition from pg_constraint
      where conrelid=('public.' || $1)::regclass order by conname`,[tablename])).rows;
    for (const c of constraints) out.push(`- \`${c.conname}\`: \`${c.definition}\``);
    out.push("", "Indexes:", "");
    for (const i of (await db.query("select indexdef from pg_indexes where schemaname='public' and tablename=$1 order by indexname",[tablename])).rows) out.push(`- \`${i.indexdef}\``);
    out.push("", "Row policies:", "");
    for (const p of (await db.query("select policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename=$1",[tablename])).rows)
      out.push(`- ${p.policyname} (${p.cmd}): USING \`${p.qual || "-"}\`; WITH CHECK \`${p.with_check || "-"}\`.`);
    out.push("");
  }
  mkdirSync(new URL("../docs/database/",import.meta.url),{recursive:true});
  writeFileSync(new URL("../docs/database/p0-column-dictionary.md",import.meta.url),out.join("\n"),"utf8");
  console.log(`Exported ${tables.length} tables to docs/database/p0-column-dictionary.md`);
} finally { await db.close(); }
