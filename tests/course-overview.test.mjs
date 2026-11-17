import { test } from "node:test";
import assert from "node:assert/strict";
import { periodByDate, pickMidtermDate, resolvePeriod } from "../src/lib/course-overview/period.ts";
import { sortMaterials } from "../src/lib/course-overview/sort.ts";
import { isDismissedDriveFile } from "../supabase/functions/_shared/driveDismissed.ts";

test("exam period: midterm exam date first, then the same month rule as the problem bank", () => {
  assert.equal(periodByDate("2026-10-20T09:00:00Z", "2026-10-21"), "midterm");
  assert.equal(periodByDate("2026-10-21", "2026-10-21"), "midterm", "the exam day itself is midterm");
  assert.equal(periodByDate("2026-10-22", "2026-10-21"), "final");
  assert.equal(periodByDate("2026-10-22", null), "midterm", "October without an exam date → midterm");
  assert.equal(periodByDate("2026-11-20", null), "final");
  assert.equal(periodByDate("", null), "midterm");
  assert.equal(resolvePeriod("note:a", "2026-09-01", null, { "note:a": "final" }), "final", "a manual move wins");
  assert.equal(pickMidtermDate([
    { title: "기말고사", event_type: "exam", date: "2026-12-15T00:00:00Z" },
    { title: "운영체제 중간고사", event_type: "exam", date: "2026-10-23T01:00:00Z" },
    { title: "중간 과제", event_type: "assignment", date: "2026-10-01" },
  ]), "2026-10-23");
  assert.equal(pickMidtermDate([]), null);
});

test("lecture materials sort by name, modified time or file type", () => {
  const note = (id, title, fileName, updatedAt) => ({ key: `note:${id}`, kind: "note", id, title, date: updatedAt, label: "강의자료",
    note: { id, title, fileName, updatedAt, tags: [] } });
  const list = [note("a", "10주차", "w10.pdf", "2026-11-03"), note("b", "2주차", "w2.pptx", "2026-11-05"), note("c", "가 개요", "intro.docx", "2026-11-01")];
  assert.deepEqual(sortMaterials(list, "name", "asc").map((m) => m.id), ["b", "a", "c"], "numeric-aware Korean order");
  assert.deepEqual(sortMaterials(list, "modified", "desc").map((m) => m.id), ["b", "a", "c"]);
  assert.deepEqual(sortMaterials(list, "type", "asc").map((m) => m.id), ["c", "a", "b"], "docx < pdf < pptx");
});

test("Drive sync skips files the user deleted in UniLink (the Drive original stays)", async () => {
  const fake = (result) => ({ from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => result }; return q; } });
  assert.equal(await isDismissedDriveFile(fake({ data: { drive_file_id: "f1" }, error: null }), "u1", "f1"), true);
  assert.equal(await isDismissedDriveFile(fake({ data: null, error: null }), "u1", "f1"), false);
  assert.equal(await isDismissedDriveFile(fake({ data: null, error: { code: "42P01" } }), "u1", "f1"), false, "before 0038 is applied");
  await assert.rejects(isDismissedDriveFile(fake({ data: null, error: { code: "XX000" } }), "u1", "f1"));
});

test("migration 0038: users only see and write their own dismissed Drive files", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync, readdirSync } = await import("node:fs");
  const db = new PGlite();
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  try {
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
    for (const file of readdirSync(directory).filter((f) => !f.startsWith("0002")).sort()) {
      await db.exec(readFileSync(new URL(file, directory), "utf8").replace('create extension if not exists "pgcrypto";', ""));
    }
    await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
    const as = async (user, sql, params = []) => {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
      try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
    };
    await as(A, "insert into public.dismissed_drive_files(user_id, drive_file_id) values ($1, 'drive-1')", [A]);
    await assert.rejects(as(A, "insert into public.dismissed_drive_files(user_id, drive_file_id) values ($1, 'x')", [B]), /row-level security/);
    assert.equal((await as(B, "select * from public.dismissed_drive_files")).rows.length, 0, "B cannot see A's rows");
    assert.equal((await as(A, "select * from public.dismissed_drive_files")).rows.length, 1);
  } finally {
    await db.close();
  }
});


test("missing dismissal DB rejects deletion before touching linked problems or notes", async () => {
  const { moduleLoader, root } = await import('../scripts/simulation/runtime.mjs');
  const path = await import('node:path');
  let touched = 0;
  const userId = '11111111-1111-4111-8111-111111111111';
  const db = {auth:{getUser:async()=>({data:{user:{id:userId}}})},from:()=>({upsert:async()=>({error:{code:'PGRST205'}})})};
  const load = moduleLoader({}, name => {
    if(name.endsWith('supabase-client'))return {getSupabaseBrowserClient:()=>db};
    if(name.endsWith('private-storage'))return {getStorageUser:()=>userId};
    if(name.endsWith('problem-bank-storage'))return {listSubjects:async()=>{touched++;return [];}};
    if(name.endsWith('my-notes-storage'))return {deleteNote:async()=>{touched++;}};
    if(/(?:course-storage|p0-sync|file-intake\/settings|problem-bank\/images|study-storage|timetable-storage)$/.test(name))return {};
  });
  const service = load(path.join(root,'src/lib/course-overview/data.ts'));
  await assert.rejects(service.deleteMaterial('course',{kind:'note',id:'note',note:{driveFileId:'drive-file'}}),/0040/);
  assert.equal(touched,0);
});
