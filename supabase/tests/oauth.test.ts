import { handleGoogleAuth } from "../functions/google-auth/index.ts";
import { codeChallenge } from "../functions/_shared/oauthProof.ts";
function assert(value: unknown): asserts value { if (!value) throw new Error("Assertion failed"); }
Deno.test("OAuth binds browser proof and user, expires states and consumes each code once", async () => {
  const env: Record<string,string> = {
    SUPABASE_URL: "https://supabase.invalid", SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service", FRONTEND_URL: "https://app.invalid/unilink",
    GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_REDIRECT_URI: "https://supabase.invalid/functions/v1/google-auth/callback",
    DRIVE_TOKEN_ENC_KEY: btoa("k".repeat(32)),
  };
  const previous = Object.fromEntries(Object.keys(env).map(k => [k, Deno.env.get(k)]));
  for (const [key,value] of Object.entries(env)) Deno.env.set(key,value);
  const originalFetch = globalThis.fetch;
  type Pending = { state:string; user_id:string; code_challenge:string; created_at:string };
  let pending: Pending | null = null;
  let exchanges = 0;
  let saves = 0;
  const verifier = "a".repeat(64);
  const challenge = await codeChallenge(verifier);
  const json = (value: unknown) => Response.json(value);
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.pathname === "/auth/v1/user") {
      const id = req.headers.get("authorization")?.replace("Bearer ", "");
      return id === "A" || id === "B" ? json({id, app_metadata:{},user_metadata:{},aud:"authenticated",created_at:"2026-01-01"}) : Response.json({message:"invalid"},{status:401});
    }
    if (url.pathname === "/rest/v1/oauth_states") {
      if (req.method === "POST") { pending = {...await req.json(), created_at:new Date().toISOString()}; return new Response(null,{status:201}); }
      if (req.method === "DELETE") {
        if (!url.searchParams.has("state")) { pending = null; return new Response(null,{status:204}); }
        const matches = pending && ["state","user_id","code_challenge"].every(k => url.searchParams.get(k) === `eq.${pending![k as keyof Pending]}`) && pending.created_at >= url.searchParams.get("created_at")!.slice(4);
        const rows = matches ? [{user_id:pending!.user_id}] : [];
        if (matches) pending = null;
        return json(rows);
      }
    }
    if (url.hostname === "oauth2.googleapis.com") {
      exchanges++;
      assert((await req.formData()).get("code_verifier") === verifier);
      return json({access_token:"fake-access", refresh_token:"fake-refresh"});
    }
    if (url.pathname === "/drive/v3/about") return json({user:{emailAddress:"test@example.invalid"}});
    if (url.pathname === "/rest/v1/drive_connections") {
      const body = await req.json(); assert(body.user_id === "A");
      assert(body.refresh_token_encrypted !== "fake-refresh"); assert(body.folder_ids.length === 0);
      saves++; return new Response(null,{status:201});
    }
    throw new Error(`Unexpected request: ${url.origin}${url.pathname}`);
  };
  const post = (action:string, body:unknown, token = "A") => handleGoogleAuth(new Request(`https://supabase.invalid/functions/v1/google-auth/${action}`, {
    method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),
  }));
  try {
    const callback = await handleGoogleAuth(new Request("https://supabase.invalid/functions/v1/google-auth/callback?code=relayed&state=state"));
    assert(callback.status === 302); assert(callback.headers.get("Location") === "https://app.invalid/unilink/notes#drive_code=relayed&drive_state=state");
    assert(exchanges === 0 && saves === 0);
    assert((await post("start",{codeChallenge:challenge},"invalid")).status === 401);
    assert((await post("start",{})).status === 400);
    const start = await (await post("start",{codeChallenge:challenge})).json();
    const consent = new URL(start.url); assert(consent.searchParams.get("code_challenge") === challenge);
    assert(consent.searchParams.get("code_challenge_method") === "S256");
    const body = {code:"fake-code",state:start.state,verifier};
    assert((await post("complete",body,"B")).status === 403);
    assert((await post("complete",{...body,verifier:"b".repeat(64)})).status === 403);
    assert(exchanges === 0 && pending !== null);
    assert((await post("complete",body)).status === 200);
    assert((await post("complete",body)).status === 403);
    assert(Number(exchanges) === 1 && Number(saves) === 1);
    const expired = await (await post("start",{codeChallenge:challenge})).json();
    (pending as unknown as Pending).created_at = new Date(Date.now()-660_000).toISOString();
    assert((await post("complete",{...body,state:expired.state})).status === 403);
    assert(Number(exchanges) === 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of Object.entries(previous)) { if (value === undefined) Deno.env.delete(key); else Deno.env.set(key,value); }
  }
});
