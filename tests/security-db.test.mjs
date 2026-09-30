import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("security migration enforces RLS, ownership, secret columns and durable budgets", async t => {
  const db = new PGlite();
  try {
    // Minimal Supabase platform schema. Application schema/policies come from real migrations.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
      grant usage on schema public, auth, storage to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of readdirSync(directory).sort()) {
      if (file.startsWith("0002")) continue; // pg_cron is platform infrastructure, not used by these policies.
      await db.exec(readFileSync(new URL(file, directory), "utf8").replace('create extension if not exists "pgcrypto";', ""));
    }
    await db.exec(`insert into auth.users values ('${A}'), ('${B}');
      insert into problem_bank_subjects(id,user_id,name) values ('${SA}','${A}','A'),('${SB}','${B}','B');
      insert into drive_connections(user_id,refresh_token_encrypted,refresh_token_iv,account_email)
        values ('${A}','ciphertext','iv','test@example.invalid');`);
    const role = async (name, user = A) => db.exec(`reset role; set role ${name}; set request.jwt.claim.sub = '${user}';`);
    await t.test("own inserts succeed; foreign subject inserts and reassignment fail", async () => {
      await role("authenticated");
      await db.exec(`insert into problem_bank_problems(subject_id,user_id,label) values ('${SA}','${A}','own');`);
      await assert.rejects(db.exec(`insert into problem_bank_problems(subject_id,user_id,label) values ('${SB}','${A}','attack');`), /row-level security/);
      await assert.rejects(db.exec(`update problem_bank_problems set subject_id='${SB}' where label='own';`), /row-level security/);
      await role("authenticated", B);
      assert.equal((await db.query("select * from problem_bank_problems")).rows.length, 0);
      await role("service_role");
      await assert.rejects(db.exec(`insert into problem_bank_problems(subject_id,user_id,label) values ('${SB}','${A}','bypass');`), /foreign key/);
    });
    await t.test("safe connection status is readable; credentials and quotas are service-only", async () => {
      await role("authenticated");
      assert.equal((await db.query("select account_email from drive_connections")).rows.length, 1);
      assert.equal(
        (await db.query("select connection_status from drive_connections")).rows[0].connection_status,
        "active",
      );
      await assert.rejects(db.query("select refresh_token_encrypted from drive_connections"), /permission denied/);
      await assert.rejects(db.query("select * from drive_connections"), /permission denied/);
      await assert.rejects(db.query(`select reserve_problem_bank_upload('${A}')`), /permission denied/);
      await assert.rejects(db.query("select * from problem_bank_upload_jobs"), /permission denied/);
      await role("authenticated", B);
      assert.equal((await db.query("select account_email from drive_connections")).rows.length, 0);
    });
    const reserve = async user => (await db.query("select reserve_problem_bank_upload($1) as id", [user])).rows[0].id;
    await t.test("parallel requests admit only one active job, then enforce five per rolling day", async () => {
      await role("service_role");
      const attempts = await Promise.all([reserve(A), reserve(A), reserve(A)]);
      assert.equal(attempts.filter(Boolean).length, 1);
      for (let i = 0; i < 4; i++) {
        await db.exec("update problem_bank_upload_jobs set finished=true");
        assert.ok(await reserve(A));
      }
      await db.exec("update problem_bank_upload_jobs set finished=true");
      assert.equal(await reserve(A), null);
      await db.exec("update problem_bank_upload_jobs set created_at=now()-interval '25 hours'");
      assert.ok(await reserve(A));
    });
    await t.test("expired leases recover; global daily and concurrent limits also reject requests", async () => {
      await db.exec("delete from problem_bank_upload_jobs");
      assert.ok(await reserve(B));
      await db.exec("update problem_bank_upload_jobs set expires_at=now()-interval '1 second'");
      assert.ok(await reserve(B));
      await db.exec(`delete from problem_bank_upload_jobs;
        insert into problem_bank_upload_jobs(user_id,finished) select '${A}',true from generate_series(1,100);`);
      assert.equal(await reserve(B), null);
      await db.exec(`delete from problem_bank_upload_jobs;
        insert into problem_bank_upload_jobs(user_id) select '${A}' from generate_series(1,10);`);
      assert.equal(await reserve(B), null);
    });
    await t.test("storage is private with server-side MIME and byte limits", async () => {
      await db.exec("reset role");
      const { rows: [bucket] } = await db.query("select * from storage.buckets where id='note-files'");
      assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 20971520);
      assert.ok(!bucket.allowed_mime_types.includes("text/html"));
      assert.ok(!bucket.allowed_mime_types.includes("image/svg+xml"));
    });
  } finally { await db.close(); }
});
