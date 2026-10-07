import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { readSmallJson, RequestError } from "../_shared/requestLimits.ts";
import { getAdminClient, getUserFromAuthHeader } from "../_shared/supabaseAdmin.ts";
import { COACHING_POLICY_VERSION, CoachingError, parseCoachingRequest, validateProposal } from "../_shared/coaching/contract.ts";
import { loadCoachingContext } from "../_shared/coaching/context.ts";
import { COACHING_PROMPT_VERSION, generateProposal } from "../_shared/coaching/model.ts";
import { coachingContextSnapshot, coachingOutputPayload, coachingRequestHash, coachingRequestKey,
  coachingRequestPayload, proposalFromStoredOutput } from "../_shared/coaching/run.ts";

export async function handleCoachingProposal(req: Request): Promise<Response> {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  let runId: string | null = null;
  let runUserId: string | null = null;
  let admin: ReturnType<typeof getAdminClient> | null = null;
  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Authentication required" }, { status: 401 });
    const rawRequest = await readSmallJson(req);
    const request = parseCoachingRequest(rawRequest);
    const requestKey = coachingRequestKey(rawRequest, req.headers.get("Idempotency-Key"));
    const requestHash = await coachingRequestHash(request);
    if (Deno.env.get("COACHING_HARNESS_ENABLED") !== "true") {
      return jsonResponse({ error: "Coaching service is not enabled" }, { status: 503 });
    }
    admin = getAdminClient();
    runUserId = user.id;
    const { data: existing, error: existingError } = await admin.from("coaching_runs")
      .select("id,status,request_payload,output_payload,prompt_version,policy_version")
      .eq("user_id", user.id).eq("request_key", requestKey).maybeSingle();
    if (existingError) throw new CoachingError("Coaching history is unavailable", 503);
    if (existing) {
      if (existing.request_payload?.request_hash !== requestHash) {
        throw new CoachingError("Coaching request key was already used for different input", 409);
      }
      const stored = proposalFromStoredOutput(existing.output_payload);
      if (existing.status === "proposed" && stored) {
        return jsonResponse({ schema_version: 2, status: "proposal", proposal: stored, proposal_run_id: existing.id,
          prompt_version: existing.prompt_version, policy_version: existing.policy_version,
          proposal_persisted: true, persisted: false, replayed: true });
      }
      return jsonResponse({ error: "Coaching request already exists", proposal_run_id: existing.id,
        run_status: existing.status }, { status: 409 });
    }
    const context = await loadCoachingContext(admin, user.id, request);
    const { data: jobId, error: reservationError } = await admin.rpc("reserve_coaching_proposal", { p_user_id: user.id });
    if (reservationError) {
      console.error("coaching quota reservation failed", {
        code: reservationError.code,
        message: reservationError.message,
        details: reservationError.details,
        hint: reservationError.hint,
      });
      throw new CoachingError("Coaching quota is unavailable", 503);
    }
    if (!jobId) return jsonResponse({ error: "Coaching request limit reached" }, { status: 429 });
    const started = Date.now();
    let resultCode = "model_error";
    let itemCount = 0;
    try {
      const { data: created, error: createError } = await admin.from("coaching_runs").insert({
        user_id: user.id, request_key: requestKey, intent: request.intent, status: "generating",
        request_payload: coachingRequestPayload(request, requestHash),
        context_snapshot: coachingContextSnapshot(context),
        policy_version: COACHING_POLICY_VERSION, contract_version: 2,
        model_name: Deno.env.get("COACHING_MODEL") ?? null,
        prompt_version: COACHING_PROMPT_VERSION,
      }).select("id").single();
      if (createError || !created) {
        if (createError?.code === "23505") throw new CoachingError("Coaching request already exists", 409);
        throw new CoachingError("Coaching history could not be created", 503);
      }
      runId = created.id;
      let proposal;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          proposal = validateProposal(await generateProposal(request, context), request, context);
          break;
        } catch (error) {
          if (!(error instanceof CoachingError) || error.status !== 502 || attempt === 2) throw error;
          console.warn("coaching proposal validation retry", { attempt });
        }
      }
      if (!proposal) throw new CoachingError("Coaching model returned no valid plan", 502);
      resultCode = "validated";
      itemCount = proposal.items.length;
      const { error: persistError } = await admin.from("coaching_runs").update({
        status: "proposed", output_payload: coachingOutputPayload(proposal), completed_at: new Date().toISOString(),
      }).eq("id", runId).eq("user_id", user.id).eq("status", "generating");
      if (persistError) throw new CoachingError("Coaching proposal could not be saved", 503);
      return jsonResponse({ schema_version: 2, status: "proposal", proposal, proposal_run_id: runId,
        prompt_version: COACHING_PROMPT_VERSION, policy_version: COACHING_POLICY_VERSION,
        proposal_persisted: true, persisted: false, replayed: false });
    } catch (error) {
      if (error instanceof CoachingError && error.status === 502) resultCode = "rejected";
      if (runId) {
        const rejected = error instanceof CoachingError && error.status === 502;
        const { error: runError } = await admin.from("coaching_runs").update({
          status: rejected ? "invalid" : "failed",
          error_code: rejected ? "model_output_rejected" : "proposal_failed",
          error_message: error instanceof CoachingError || error instanceof RequestError ? error.message : "Coaching request failed",
          completed_at: new Date().toISOString(),
        }).eq("id", runId).eq("user_id", user.id).eq("status", "generating");
        if (runError) console.error("coaching run failure update failed");
      }
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
      ? error.message : "Coaching request failed", ...(runId && runUserId ? { proposal_run_id: runId } : {}) }, { status });
  }
}

if (import.meta.main) Deno.serve(handleCoachingProposal);
