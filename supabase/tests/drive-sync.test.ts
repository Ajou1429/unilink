import { getDriveFolderPath, listPdfFilesInFolderTree } from "../functions/_shared/google.ts";
import { handleDriveSync } from "../functions/drive-sync/index.ts";
import { encryptSecret } from "../functions/_shared/crypto.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }

Deno.test("Drive descendant scans preserve real ancestry and exhaust folder/PDF pages", async () => {
  const original = globalThis.fetch;
  const queried: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const id = url.pathname.split("/").pop();
    const folders: Record<string, unknown> = {
      quality: { id: "quality", name: "Quality", parents: ["goodnotes"] },
      goodnotes: { id: "goodnotes", name: "GoodNotes", parents: ["mydrive"] },
      mydrive: { id: "mydrive", name: "My Drive" },
    };
    if (id !== "files") return Response.json(folders[id!] ?? {}, { status: folders[id!] ? 200 : 404 });
    const q = url.searchParams.get("q")!, page = url.searchParams.get("pageToken");
    const parent = q.match(/^'([^']+)'/)?.[1] ?? q.match(/'([^']+)' in parents/)?.[1];
    queried.push(`${parent}:${q.includes("application/pdf") ? "pdf" : "folder"}:${page ?? "first"}`);
    if (q.includes("application/vnd.google-apps.folder")) {
      if (parent === "quality" && !page) return Response.json({ nextPageToken: "next-folder", files: [{ id: "week1", name: "Week 1" }] });
      if (parent === "quality" && page) return Response.json({ files: [{ id: "week2", name: "Week 2" }] });
      return Response.json({ files: [] });
    }
    if (parent === "week1" && !page) return Response.json({ nextPageToken: "next-pdf", files: [{ id: "pdf1", name: "One.pdf", modifiedTime: "2026-11-14T00:00:00Z" }] });
    return Response.json({ files: [{ id: `${parent}-${page ?? "one"}`, name: "Notes.pdf", modifiedTime: "2026-11-14T00:00:00Z" }] });
  };
  try {
    assert(JSON.stringify((await getDriveFolderPath("test", "quality")).pathIds) === '["goodnotes","quality"]');
    const files = await listPdfFilesInFolderTree("test", "quality");
    assert(files.length === 4);
    assert(files.every((file) => file.driveFolderPathIds?.[0] === "goodnotes"));
    assert(files.find((file) => file.id === "pdf1")?.driveFolderPath?.join("/") === "GoodNotes/Quality/Week 1");
    assert(queried.includes("week2:pdf:first") && queried.includes("week1:pdf:next-pdf"));
  } finally { globalThis.fetch = original; }
});

Deno.test("Drive sync keeps parent watch scope, preserves classification, retries safely and reports expiry/failure", async () => {
  const env = { SUPABASE_URL: "https://supabase.invalid", SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test", GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", DRIVE_TOKEN_ENC_KEY: btoa("x".repeat(32)) };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, Deno.env.get(key)]));
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const original = globalThis.fetch, encrypted = await encryptSecret("refresh");
  let mode = "ok", saved = 0;
  const connection = { folder_id: "goodnotes", folder_ids: ["goodnotes"], folder_names: ["GoodNotes"], refresh_token_encrypted: encrypted.ciphertext, refresh_token_iv: encrypted.iv, connection_status: "active" };
  let note = { id: "note", version: 2, drive_file_id: "pdf", drive_modified_time: "2026-11-13T00:00:00Z", linked_id: "quality-course", linked_type: "course", drive_folder_path: ["Quality"], sync_status: "synced" };
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "owner" });
    if (url.pathname === "/rest/v1/drive_connections") {
      if (req.method !== "GET") Object.assign(connection, await req.json());
      return req.method === "GET" ? Response.json(connection) : new Response(null, { status: 204 });
    }
    if (url.pathname === "/rest/v1/notes") {
      if (req.method === "GET") return Response.json(note);
      const body = await req.json();
      assert(!("linked_id" in body) && !("linked_type" in body));
      note = { ...note, ...body }; saved++; return Response.json({ id: note.id });
    }
    if (url.hostname === "oauth2.googleapis.com") return mode === "expired" ? Response.json({ error: "invalid_grant" }, { status: 400 }) : Response.json({ access_token: "access" });
    if (mode === "failed") return Response.json({}, { status: 503 });
    if (url.pathname.endsWith("/quality")) return Response.json({ id: "quality", name: "Quality", parents: ["goodnotes"] });
    if (url.pathname.endsWith("/goodnotes")) return Response.json({ id: "goodnotes", name: "GoodNotes", parents: ["root"] });
    if (url.pathname.endsWith("/root")) return Response.json({ id: "root", name: "My Drive" });
    if (url.pathname.endsWith("/files")) return Response.json({ files: url.searchParams.get("q")?.includes("application/pdf") ? [{ id: "pdf", name: "Note.pdf", modifiedTime: "2026-11-14T00:00:00Z" }] : [] });
    throw new Error("Unexpected endpoint");
  };
  const request = () => new Request("https://supabase.invalid/functions/v1/drive-sync", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ folderIds: ["quality"], folderNames: ["Quality"] }) });
  try {
    const success = await handleDriveSync(request()); assert(success.status === 200);
    assert((await success.json()).filesFound === 1);
    assert(connection.folder_ids[0] === "goodnotes" && note.linked_id === "quality-course");
    assert(JSON.stringify(note.drive_folder_path) === '["GoodNotes","Quality"]');
    assert((await handleDriveSync(request())).status === 200 && saved === 1);
    mode = "expired";
    const expired = await handleDriveSync(request()); assert(expired.status === 409 && (await expired.json()).code === "reconnect_required");
    assert(connection.connection_status === "reconnect_required");
    mode = "failed";
    const failed = await handleDriveSync(request()); assert(failed.status === 502 && !("syncedAt" in await failed.json()));
    assert(saved === 1 && connection.folder_ids[0] === "goodnotes");
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); }
  }
});
