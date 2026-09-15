import { parseFolderIds, validateDriveId } from "../functions/_shared/driveInputs.ts";
import { readLimitedBody, readSmallJson, RequestError } from "../functions/_shared/requestLimits.ts";
import { validatePdf, validatePageCount, flattenLabels, MAX_PDF_BYTES } from "../functions/_shared/pdfLimits.ts";
import { codeChallenge, validVerifier } from "../functions/_shared/oauthProof.ts";
function assert(value: unknown): asserts value { if (!value) throw new Error("Assertion failed"); }
function rejects(fn: () => unknown, status: number) {
  try { fn(); throw new Error("Expected rejection"); } catch (e) { assert(e instanceof RequestError && e.status === status); }
}
Deno.test("PKCE matches RFC 7636 vector and rejects malformed proofs", async () => {
  assert(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert(validVerifier("a".repeat(43))); assert(!validVerifier("a".repeat(42)));
  assert(!validVerifier("a".repeat(129))); assert(!validVerifier({}));
});
Deno.test("bounded stream rejects oversized declared or undeclared bodies", async () => {
  for (const headers of [new Headers(), new Headers({ "content-length": "100" })]) {
    try { await readLimitedBody(new Request("https://local.invalid", { method: "POST", headers, body: "123456" }), 5); throw new Error("Expected rejection"); }
    catch (e) { assert(e instanceof RequestError && e.status === 413); }
  }
  assert((await readLimitedBody(new Response("12345"), 5)).length === 5);
  try { await readSmallJson(new Request("https://local.invalid", { method: "POST", body: "[]" })); throw new Error("Expected rejection"); }
  catch (e) { assert(e instanceof RequestError && e.status === 400); }
});
Deno.test("stream deadline cancels a stalled upload", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const controller = new AbortController();
  const pending = readLimitedBody(response, 10, controller.signal);
  controller.abort();
  try { await pending; throw new Error("Expected abort"); } catch (e) { assert(e instanceof DOMException && e.name === "AbortError"); }
  assert(cancelled);
});
Deno.test("PDF signature, MIME, byte/page and AI output limits are enforced", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7"); validatePdf(pdf, "application/pdf");
  rejects(() => validatePdf(pdf, "text/html"), 415);
  rejects(() => validatePdf(new TextEncoder().encode("<html>"), "application/pdf"), 415);
  rejects(() => validatePdf(new Uint8Array(MAX_PDF_BYTES + 1), "application/pdf"), 413);
  validatePageCount(50); for (const count of [0, 51, 1.5]) rejects(() => validatePageCount(count), 413);
  assert(flattenLabels([{number:"1", parts:["a","b"]}]).join(",") === "1(a),1(b)");
  rejects(() => flattenLabels([{number:"1", parts: "bad"}]), 502);
  rejects(() => flattenLabels(Array.from({length:11}, () => ({number:"1",parts:Array(100).fill("a")}))), 502);
});

Deno.test("Drive input cannot inject query expressions or unbounded folder lists", () => {
  assert(validateDriveId("root") === "root");
  assert(parseFolderIds(["abc", "https://drive.google.com/drive/folders/abc?usp=sharing"]).join() === "abc");
  rejects(() => validateDriveId("x' in parents or trashed = false or 'x"), 400);
  rejects(() => validateDriveId("../about"), 400);
  rejects(() => parseFolderIds(Array(11).fill("abc")), 400);
  rejects(() => parseFolderIds(["https://attacker.invalid/folders/abc"]), 400);
});
