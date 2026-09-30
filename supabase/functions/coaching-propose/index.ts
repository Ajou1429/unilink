import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { readSmallJson, RequestError } from "../_shared/requestLimits.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { COACHING_POLICY_VERSION, CoachingError, parseCoachingRequest, validateProposal } from "../_shared/coaching/contract.ts";
import { loadCoachingContext } from "../_shared/coaching/context.ts";
import { COACHING_PROMPT_VERSION, generateProposal } from "../_shared/coaching/model.ts";

export async function handleCoachingProposal(req: Request): Promise<Response> {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const request = parseCoachingRequest(await readSmallJson(req));
    if (Deno.env.get("COACHING_HARNESS_ENABLED") !== "true") {
      return jsonResponse({ error: "Coaching service is not enabled" }, { status: 503 });
    }
    const admin = getAdminClient();
    const context = await loadCoachingContext(admin, user.id, request);
    const { data: jobId, error: reservationError } = await admin.rpc("reserve_coaching_proposal", { p_user_id: user.id });
    if (reservationError) throw new CoachingError("Coaching quota is unavailable", 503);
    if (!jobId) return jsonResponse({ error: "Coaching request limit reached" }, { status: 429 });
    const started = Date.now();
    let resultCode = "model_error";
    let itemCount = 0;
    try {
      const proposal = validateProposal(await generateProposal(request, context), request, context);
      resultCode = "validated";
      itemCount = proposal.items.length;
      return jsonResponse({ schema_version: 2, status: "proposal", proposal, proposal_run_id: jobId,
        prompt_version: COACHING_PROMPT_VERSION, policy_version: COACHING_POLICY_VERSION, persisted: false });
    } catch (error) {
      if (error instanceof CoachingError && error.status === 502) resultCode = "rejected";
      throw error;
    } finally {
      const { error } = await admin.from("coaching_proposal_jobs").update({
        finished: true, result_code: resultCode, item_count: itemCount,
        latency_ms: Date.now() - started, model_name: Deno.env.get("COACHING_MODEL") ?? null,
        prompt_version: COACHING_PROMPT_VERSION, policy_version: COACHING_POLICY_VERSION,
      }).eq("id", jobId).eq("user_id", user.id);
      if (error) console.error("coaching job status update failed");
    }
  } catch (error) {
    const status = error instanceof CoachingError || error instanceof RequestError ? error.status : 503;
    console.error("coaching-propose failed", { status });
    return jsonResponse({ error: error instanceof CoachingError || error instanceof RequestError
      ? error.message : "Coaching request failed" }, { status });
  }
}

if (import.meta.main) Deno.serve(handleCoachingProposal);
