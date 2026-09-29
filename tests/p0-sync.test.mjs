import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const root = fileURLToPath(new URL("../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const clone = (value) => JSON.parse(JSON.stringify(value));

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key), clear: () => data.clear() };
}

// Execute the real browser modules. Only the browser and HTTP transport are replaced.
function browser(client) {
  const window = new EventTarget();
  Object.assign(window, { localStorage: storage(), sessionStorage: storage(), setTimeout: () => 1, clearTimeout: () => {} });
  const context = vm.createContext({ window, Event, CustomEvent, crypto, TextEncoder, console, Date, Map, Set });
  const cache = new Map();
  function load(filename) {
    if (!filename.endsWith(".ts")) filename += ".ts";
    if (filename.endsWith("supabase-client.ts")) return { getSupabaseBrowserClient: () => client };
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(
      (specifier) => specifier.startsWith(".") ? load(path.resolve(path.dirname(filename), specifier)) : nativeRequire(specifier), loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return { window, load: (name) => load(path.join(root, "src/lib", name)) };
}

// SQL runs against the actual migrations, including column names, FKs, CHECKs and RLS.
function transport(db) {
  const state = { failNext: false, afterRead: null };
  const client = { from(table) {
    let action = "select", columns = "*", payload, options, offset = 0, limit, ordered;
    const filters = [];
    const q = {
      select(value = "*") { columns = value; return q; },
      eq(key, value) { filters.push([key, value]); return q; },
      order(key) { ordered = key; return q; },
      range(first, last) { offset = first; limit = last - first + 1; return q; },
      upsert(value, opts) { action = "upsert"; payload = value; options = opts; return q; },
      update(value) { action = "update"; payload = value; return q; },
      delete() { action = "delete"; return q; },
      then(resolve, reject) { return execute().then(resolve, reject); },
    };
    async function execute() {
      if (state.failNext) { state.failNext = false; return { data: null, error: { message: "Simulated network failure" } }; }
      const params = [];
      const bind = (value) => { params.push(value && typeof value === "object" ? JSON.stringify(value) : value); return `$${params.length}`; };
      const where = () => filters.length ? " where " + filters.map(([key, value]) => `"${key}" = ${bind(value)}`).join(" and ") : "";
      try {
        let sql;
        if (action === "select") sql = `select ${columns} from "${table}"${where()}${ordered ? ` order by "${ordered}"` : ""}${limit ? ` limit ${limit} offset ${offset}` : ""}`;
        if (action === "delete") sql = `delete from "${table}"${where()}`;
        if (action === "update") sql = `update "${table}" set ${Object.entries(payload).map(([key, value]) => `"${key}" = ${bind(value)}`).join(",")}${where()}`;
        if (action === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          const keys = [...new Set(rows.flatMap(Object.keys))];
          sql = `insert into "${table}" (${keys.map((key) => `"${key}"`).join(",")}) values ` +
            rows.map((row) => `(${keys.map((key) => key in row ? bind(row[key]) : "default").join(",")})`).join(",") +
            ` on conflict (${options.onConflict}) do ` + (options.ignoreDuplicates ? "nothing" :
              "update set " + keys.filter((key) => key !== options.onConflict).map((key) => `"${key}" = excluded."${key}"`).join(","));
        }
        const result = await db.query(sql, params);
        if (action === "select" && state.afterRead) await state.afterRead(table);
        return { data: clone(result.rows), error: null };
      } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
    }
    return q;
  } };
  return { client, state };
}

test("browser P0 persistence against the real PostgreSQL schema", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  for (const name of ["0001_notes_and_drive.sql", "0010_core_learning.sql", "0011_p0_schedules.sql", "0012_p0_planning_execution.sql"]) {
    await db.exec(readFileSync(path.join(root, "supabase/migrations", name), "utf8").replace('create extension if not exists "pgcrypto";', ""));
  }
  await db.exec(`insert into auth.users values ('${A}'),('${B}'); set role authenticated; set request.jwt.claim.sub='${A}';`);
  const { client, state } = transport(db);
  const app = browser(client);
  const local = app.load("private-storage");
  const sync = app.load("p0-sync");
  local.setStorageUser(A);
  const set = (key, value) => local.privateStorage.setItem(`unilink:${key}`, JSON.stringify(value));
  const get = (key) => JSON.parse(local.privateStorage.getItem(`unilink:${key}`) ?? "[]");
  const query = async (table) => (await db.query(`select * from ${table}`)).rows;
  const course = { id: "course-a", name: "Database", term: "2026-2", professor: "P", credits: 3, location: "Room", color: "red",
    days: ["월", "토"], startTime: "08:00", endTime: "09:00", schedules: [{ day: "월", startTime: "08:00", endTime: "09:00" }, { day: "토", startTime: "13:30", endTime: "15:00" }] };
  const plan = { id: "plan-a", courseId: course.id, courseName: course.name, title: "Review", description: "Goal", dueDate: "2026-10-01", weekStart: "2026-09-27", isCompleted: false, createdAt: "2026-09-27T00:00:00Z" };
  const work = { id: "other-a", title: "Appointment", days: ["일", "금"], startTime: "08:00", endTime: "09:00", schedules: [
    { day: "일", startTime: "08:00", endTime: "09:00" }, { day: "금", startTime: "14:00", endTime: "17:00" }], color: "red", createdAt: plan.createdAt };
  set("courses", [course]);
  set("course-plans", [plan]);
  set("weekly-study-plans", [plan, { ...plan, id: "self-plan", courseId: "self" }]);
  set("monthly-study-plans", [{ ...plan, id: "weekly-plan-a", month: "2026-09" }]);
  set("personal-studies", [{ id: "personal-a", title: "Certificate", category: "certificate", goal: "Pass", status: "active", targetDate: "2026-10-05", createdAt: plan.createdAt }]);
  set("personal-study-plans", [{ ...plan, id: "personal-plan-a", studyId: "personal-a" }]);
  set("work-schedules", [work]);
  set("monthly-events", [{ id: "event-a", title: "Deadline", date: "2026-10-05", startTime: "09:00", endTime: "10:00", kind: "personal-deadline", personalStudyId: "personal-a" }]);
  set("course-sessions", [{ id: "session-a", courseId: course.id, date: "2026-09-27", startTime: "08:00", endTime: "09:00", pace: "상", progressTitle: "Chapter 1" }]);
  let stop;
  try {
    await t.test("first import is valid, keeps weekend times, links deadlines, avoids mirror duplicates and preserves self plans", async () => {
      await sync.initializeP0Account(A);
      assert.equal((await query("courses")).length, 1);
      assert.equal((await query("course_schedules")).length, 2);
      assert.equal((await query("study_plans")).length, 3);
      assert.equal((await query("study_plan_items")).length, 3);
      assert.equal((await query("calendar_events"))[0].is_blocking, false);
      assert.ok((await query("calendar_events"))[0].goal_id);
      assert.equal((await query("course_sessions"))[0].pace, null);
      assert.equal((await query("courses"))[0].metadata.legacy_record.id, course.id);
      assert.ok(local.privateStorage.getItem("unilink:p0-before-import-v1"));
      await sync.initializeP0Account(A);
      assert.equal((await query("study_plans")).length, 3);
    });
    await t.test("empty browser restores every managed category, daily times stay HH:mm, monthly mirrors reappear", async () => {
      app.window.localStorage.clear();
      await sync.initializeP0Account(A);
      assert.equal(get("courses")[0].name, course.name);
      assert.equal(get("courses")[0].schedules.find((slot) => slot.day === "토").startTime, "13:30");
      assert.equal(get("work-schedules")[0].schedules.length, 2);
      assert.equal(get("personal-studies")[0].title, "Certificate");
      assert.equal(get("personal-study-plans").length, 1);
      assert.equal(get("weekly-study-plans").length, 2);
      assert.ok(get("monthly-study-plans").some((item) => item.id === "weekly-plan-a"));
    });
    stop = sync.startP0SyncListener();
    await t.test("rapid edits across storage keys update real rows and preserve completed plans", async () => {
      set("courses", [{ ...get("courses")[0], name: "Database updated" }]);
      set("weekly-study-plans", get("weekly-study-plans").map((item) => ({ ...item, isCompleted: true })));
      await sync.flushP0Changes();
      assert.equal((await query("courses"))[0].name, "Database updated");
      assert.equal((await query("study_plans")).filter((item) => item.status === "completed").length, 2);
    });
    await t.test("failed writes survive reload and retry before remote hydration", async () => {
      set("courses", [{ ...get("courses")[0], name: "Offline edit" }]);
      state.failNext = true;
      await assert.rejects(sync.flushP0Changes());
      sync.stopP0Sync();
      await sync.initializeP0Account(A);
      assert.equal((await query("courses"))[0].name, "Offline edit");
      assert.equal(get("courses")[0].name, "Offline edit");
    });
    await t.test("changing a recurring class slot removes the previous slot without duplicates", async () => {
      const current = get("courses")[0];
      set("courses", [{ ...current, schedules: current.schedules.map((slot) => slot.day === "월" ? { ...slot, startTime: "07:30" } : slot) }]);
      await sync.flushP0Changes();
      const slots = await query("course_schedules");
      assert.equal(slots.length, 2);
      assert.equal(slots.find((slot) => slot.day_of_week === 1).start_time, "07:30:00");
    });
    await t.test("deleting a weekly plan cancels its single DB task and removes course/monthly mirrors", async () => {
      set("weekly-study-plans", get("weekly-study-plans").filter((record) => record.id !== plan.id));
      await sync.flushP0Changes();
      const stored = (await query("study_plans")).find((row) => row.request_metadata.legacy_record.id === plan.id);
      assert.equal(stored.status, "cancelled");
      assert.equal((await query("study_plan_items")).find((row) => row.plan_id === stored.id).status, "cancelled");
      assert.ok(!get("course-plans").some((record) => record.id === plan.id));
      assert.ok(!get("monthly-study-plans").some((record) => record.id === "weekly-" + plan.id));
    });
    await t.test("deletion updates valid columns and old browser records do not resurrect tombstones", async () => {
      const oldWork = get("work-schedules");
      set("work-schedules", []);
      set("monthly-events", []);
      set("personal-study-plans", []);
      set("personal-studies", []);
      await sync.flushP0Changes();
      assert.ok((await query("recurring_commitments")).every((row) => row.metadata.deleted && !row.is_blocking));
      assert.equal((await query("calendar_events"))[0].status, "cancelled");
      stop();
      set("work-schedules", oldWork);
      await sync.initializeP0Account(A);
      assert.equal(get("work-schedules").length, 0);
      assert.equal(get("personal-studies").length, 0);
      assert.equal(get("personal-study-plans").length, 0);
      stop = sync.startP0SyncListener();
    });
    await t.test("records beyond the first response page all restore", async () => {
      set("monthly-study-goals", Array.from({ length: 501 }, (_, index) => ({ id: `monthly-${index}`, title: `Goal ${index}`, month: "2026-10", createdAt: plan.createdAt })));
      await sync.flushP0Changes();
      app.window.localStorage.clear();
      await sync.initializeP0Account(A);
      assert.equal(get("monthly-study-goals").length, 501);
      assert.ok(get("monthly-study-goals").some((record) => record.id === "monthly-500"));
    });
    await t.test("partial cache never archives another device's untouched course", async () => {
      const row = (await query("courses"))[0];
      await db.query(`insert into courses(id,user_id,name,term,metadata) values ($1,$2,'Other device','2026-2',$3)`,
        ["00000000-0000-4000-8000-000000000099", A, JSON.stringify({ ...row.metadata, legacy_record: { ...course, id: "other-device" } })]);
      set("courses", [{ ...get("courses")[0], name: "Final title" }]);
      await sync.flushP0Changes();
      assert.equal((await query("courses")).find((row) => row.name === "Other device").status, "active");
    });
    await t.test("account switch during fetch cannot hydrate the new account with the old account's rows", async () => {
      state.afterRead = async () => { state.afterRead = null; local.setStorageUser(B); };
      await assert.rejects(sync.initializeP0Account(A));
      assert.deepEqual(get("courses"), []);
      await db.exec(`set request.jwt.claim.sub='${B}'`);
      assert.equal((await query("courses")).length, 0);
    });
  } finally { stop?.(); sync.stopP0Sync(); await db.close(); }
});
