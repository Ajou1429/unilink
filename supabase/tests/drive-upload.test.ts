import { handleDriveUpload } from "../functions/drive-upload/index.ts";
import { searchDriveContents } from "../functions/_shared/google.ts";
import { encryptSecret } from "../functions/_shared/crypto.ts";
function assert(value: unknown): asserts value { if (!value) throw new Error("Assertion failed"); }

Deno.test("Drive upload retries reuse remote files and preserve note classification", async () => {
  const env = { SUPABASE_URL: "https://supabase.invalid", SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test", GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", DRIVE_TOKEN_ENC_KEY: btoa("x".repeat(32)) };
  const previous = Object.fromEntries(Object.keys(env).map((k) => [k, Deno.env.get(k)]));
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  const encrypted = await encryptSecret("test-refresh");
  const original = globalThis.fetch;
  const user = "00000000-0000-4000-8000-000000000001";
  const noteId = "00000000-0000-4000-8000-000000000002";
  let note = { id: noteId, user_id: user, linked_type: "course", linked_id: "course-a", linked_title: "Operating Systems", title: "Note", content: "Study deadlocks", file_path: null, drive_file_id: null as string | null, updated_at: "2026-10-01T00:00:00Z" };
  let allocated: string | null = null, remoteExists = false, writes = 0, failSave = true;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: user });
    if (url.pathname === "/rest/v1/notes") {
      if (req.method === "GET") { assert(url.searchParams.get("user_id") === `eq.${user}`); return Response.json(note); }
      if (failSave) { failSave = false; return Response.json({ message: "temporary DB error" }, { status: 500 }); }
      const body = await req.json();
      assert(!("linked_type" in body) && !("linked_id" in body));
      note = { ...note, ...body }; return Response.json({ id: noteId });
    }
    if (url.pathname === "/rest/v1/drive_connections") return Response.json({ refresh_token_encrypted: encrypted.ciphertext, refresh_token_iv: encrypted.iv });
    if (url.pathname === "/rest/v1/rpc/reserve_drive_upload") return Response.json("job");
    if (url.pathname === "/rest/v1/drive_upload_jobs") {
      if (req.method === "GET") return Response.json({ drive_file_id: allocated });
      const body = await req.json(); if (body.drive_file_id) allocated = body.drive_file_id;
      return new Response(null, { status: 204 });
    }
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "test-access" });
    if (url.pathname === "/drive/v3/files" && req.method === "GET") return Response.json({ files: [{ id: url.searchParams.get("q")?.includes("value='root'") ? "rootFolder" : "courseFolder" }] });
    if (url.pathname === "/drive/v3/files/generateIds") return Response.json({ ids: ["stable-file"] });
    if (url.pathname === "/drive/v3/files/stable-file") return remoteExists ? Response.json({ id: "stable-file", modifiedTime: "2026-10-29T01:00:00Z" }) : new Response(null, { status: 404 });
    if (url.pathname === "/upload/drive/v3/files") { assert((await req.json()).id === "stable-file"); return new Response(null, { headers: { Location: "https://www.googleapis.com/upload/session" } }); }
    if (url.pathname === "/upload/session") { writes++; remoteExists = true; assert(await req.text() === "Study deadlocks"); return Response.json({ id: "stable-file", modifiedTime: "2026-10-29T01:00:00Z" }); }
    throw new Error(`Unexpected endpoint: ${url.pathname}`);
  };
  try {
    const request = () => new Request("https://supabase.invalid/functions/v1/drive-upload", { method: "POST", headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ noteId }) });
    assert((await handleDriveUpload(request())).status === 503);
    assert((await handleDriveUpload(request())).status === 200);
    assert((await handleDriveUpload(request())).status === 200);
    assert(writes === 1 && note.drive_file_id === "stable-file" && note.linked_id === "course-a");
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of Object.entries(previous)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  }
});

Deno.test("Drive search escapes query data and bounds pagination", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = (input) => {
    const url = new URL(String(input));
    assert(url.searchParams.get("q")?.includes("name contains 'a\\'b\\\\c'"));
    count++;
    return Promise.resolve(Response.json({ nextPageToken: `page-${count}`, files: [{ id: String(count), name: "PDF", mimeType: "application/pdf", parents: ["parent"] }] }));
  };
  try {
    const result = await searchDriveContents("test", "a'b\\c");
    assert(count === 5 && result.truncated && result.pdfs.length === 5 && result.pdfs[0].parents?.[0] === "parent");
  } finally { globalThis.fetch = original; }
});
