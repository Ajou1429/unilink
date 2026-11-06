# UniLink coaching input update - 2026-11-06

## Scope and status

Deployed input implementation: `coaching-evidence-v2`, prompt `course-knowledge-v13`.
The subsequent model rollout adds migration 0028 and the server-only `synthesis_model` setting. It does not change the approval/UI contract.
Production PDF analysis is `gpt-5.4-mini`, research remains `gpt-4.1`, and final synthesis is `gpt-6.1-sol`.
Actual production API compatibility was verified with synthetic data. See `coaching-release-2026-11-06.md` for results and limitations.

## Input contract

The Responses request separates:

- `instructions`: service role, evidence semantics, decision procedure and hard constraints.
- Developer message: current intent and, if needed, server validation feedback.
- User message: JSON with `request`, `goal_briefs`, and `shared_context`.
- Strict output JSON Schema: unchanged proposal contract, followed by server validation and user approval.

Each goal brief contains the goal, material knowledge, confirmed topics, actual class progress, self-reports, scored checks, execution history, deadlines and existing plans. A source record is not also copied into a flat top-level context. Knowledge source pages, IDs, quotes and existing uncertainty survive grouping. No extra model call or PDF reanalysis is introduced by formatting.

Missing records are not zero, failure, or proof no events exist. Incomplete and truncated material are explicit; stale check IDs remain visible. Self-reports, sampled quiz scores, recorded activity, model-extracted quotations and external estimates are distinct evidence types. No blended mastery score or fixed priority weights are calculated.

Common timezone, allowed methods, blocked events and recurring commitments are supplied separately. Request windows/budgets remain unchanged. Scheduling feasibility stays server-enforced.

## Reasoning guidance

Interpret actual content and required depth; compare dated learner observations; choose specific meaningful tasks; only then allocate provisional time. Require a concrete task, source reference when available and an observable completion criterion in existing text fields. Scope gaps must be acknowledged. Hypothetical contrast examples illustrate weak/strong evidence, unknown scope and reduced availability; they must never become invented course facts.

The previously accumulated prompt was consolidated into six sections: role/input, evidence semantics, decision procedure, hard scheduling/output contract, response quality, and contrast examples. Prompt source length fell from 10,539 to 4,578 characters compared with the local pre-consolidation version (not a measured tokenizer/API cost reduction).

The new prompt version is saved by the existing run flow. The DB context snapshot stores its existing sanitized context once plus the model input schema version. `groupEvidenceContext` can reconstruct the grouped input from that saved context without a duplicate copy of all evidence. No secrets are added. The approval RPC's `context.timezone` path is unchanged.

## Cost and model routing

- Reuse structured PDF/search results from DB; do not send raw PDFs to final synthesis.
- Formatting adds no model call. Grouping avoids duplicated evidence, but actual total token savings are NOT yet measured and instructions still have overhead.
- Do not automatically rerun all existing PDF analyses solely to compare models.
- Stronger synthesis cannot recover concepts lost during PDF extraction or current bounded context selection.
- Do not silently upgrade research, quiz generation or other workloads when changing final synthesis.

## Validation and remaining quality evaluation

Automated tests verify grouping, goal isolation, source retention, zero vs absent values, private metadata removal, stale/truncated flags, unchanged source data, counterfactual observations and actual mocked provider payloads. Existing pipeline, scheduling and response-contract regression tests remain in place.

These tests do NOT establish better educational recommendations. Run a held-out evaluation on at least two real courses and one personal goal, with consent and redacted data:

| Pair | Change only | Expected quality difference |
| --- | --- | --- |
| Weak vs strong understanding | self-rating and check result | targeted support vs new application; not identical tasks |
| Near vs distant deadline | due date | evidence-grounded priority change |
| 120 vs 30 minutes | daily budget | reduced scope with explicit deferred work |
| Material vs missing material | content evidence | concrete work vs clearly provisional diagnostic |
| Fresh vs stale check | source version/staleness | current signal vs historical uncertainty |
| Normal vs truncated knowledge | coverage flags | no claim of full-course understanding |

Compare old/new prompt on the same model first; then compare final synthesis models with the same prepared input. Review content correctness, evidence linkage, useful completion checks, time feasibility, goal mixing, uncertainty, input/output/reasoning tokens, latency and failures. Human review calibrates any automated grader. Semantic gains and optimal model choice remain unproven until this comparison.

Later collect actual time, completed scope and noncompletion reasons before calibrating personal time estimates. This is application-level personalization, not automatic LLM fine-tuning. Fine-tuning, OCR/text extraction, page-level caching, semester scheduling and new per-item evidence fields require separate validated work.

## Compatibility review

Review found and fixed two local-change risks: intent-specific instructions still pointed to the old flat context, and the new snapshot duplicated all evidence. Daily sources now resolve `kind=event` to brief deadlines and `kind=plan` to existing plans; exam and review instructions reference the new request/shared paths. Snapshots keep the existing `context.timezone` path and a schema marker, with lossless grouping reconstruction tested.

No changes to frontend components, request/response contracts, schedule fitting/validation, approval RPCs, request hashes, replay logic, DB schema or quotas were required. Proposed tasks/reasons may intentionally differ; this is a model-behavior change, not just cosmetic formatting. Compatibility tests do not prove educational improvement, citation correctness or absence of every production regression. Final model migration remains separate.

## Sources

- https://developers.openai.com/api/docs/guides/prompt-engineering
- https://developers.openai.com/api/docs/guides/evaluation-best-practices
- https://github.com/openai/openai-agents-python/blob/main/docs/context.md
- https://www.anthropic.com/research/building-effective-agents
- https://docs.langchain.com/oss/python/langchain/context-engineering
