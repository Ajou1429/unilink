import type { CoachingContext, CoachingRequest } from "./contract.ts";
import { modelContext } from "./context.ts";
import { BANK_STAGE_LABELS, SELF_RATING_LABELS } from "./problemBank.ts";
export const MODEL_INPUT_VERSION = "coaching-evidence-v6";

// Group by ownership before generation; each evidence record is sent only once.
export function buildEvidenceContext(source: CoachingContext) {
  return groupEvidenceContext(modelContext(source));
}

export function groupEvidenceContext(context: ReturnType<typeof modelContext>) {
  const goal_briefs = context.goals.map((goal) => {
    const evidence = {
      course_knowledge: context.course_knowledge.filter((row) => row.goal_id === goal.id),
      confirmed_topics: context.topics.filter((row) => row.goal_id === goal.id),
      recorded_class_progress: context.recent_course_progress.filter((row) => goal.course_id !== null && row.course_id === goal.course_id),
      self_reports: context.topic_learning_states.filter((row) => row.goal_id === goal.id),
      scored_checks: context.topic_check_results.filter((row) => row.goal_id === goal.id),
      problem_bank_stages: (context.problem_bank?.records ?? []).filter(row => row.goal_id === goal.id),
      satisfaction_observations: (context.satisfaction?.records ?? []).filter(row => row.goal_id === goal.id),
      previous_understanding: (context.understanding_history?.records ?? []).filter(row=>row.goal_id===goal.id),
      deadlines: context.deadlines.filter((row) => row.goal_id === goal.id),
      study_history: context.recent_study.filter((row) => row.goal_id === goal.id),
      existing_plan: context.existing_items.filter((row) => row.goal_id === goal.id),
    };
    return { goal, ...evidence,
      personalization_basis: {
        study_observations: evidence.study_history.length, self_report_observations: evidence.self_reports.length,
        sampled_checks: evidence.scored_checks.length,
        distinct_satisfaction_runs: new Set(evidence.satisfaction_observations.map(row => row.run_id)).size,
        previous_understanding_observations: evidence.previous_understanding.length,
        completed_sessions: evidence.study_history.filter(row => row.completion_status === "completed").length,
        partial_sessions: evidence.study_history.filter(row => row.completion_status === "partial").length,
        meaning: "Evidence counts, not learned weights or confidence scores. No history means a provisional recommendation, not a blocked request.",
      },
      evidence_gaps: {
        missing_records: Object.entries(evidence).filter(([, rows]) => rows.length === 0).map(([name]) => name),
        incomplete_material: evidence.course_knowledge.some((row) => row.overview_complete !== true || row.detail_complete !== true),
        truncated_material: evidence.course_knowledge.some((row) => row.context_truncated === true),
        stale_check_ids: evidence.scored_checks.filter((row) => row.source_stale).map((row) => row.attempt_id),
      } };
  });
  return { goal_briefs, shared_context: {
    timezone: context.timezone, allowed_methods: context.methods,
    evidence_scales: { self_rating_1_to_5: SELF_RATING_LABELS, problem_bank_stage_0_to_5: BANK_STAGE_LABELS,
      interpretation: "Self-report scales, not test accuracy. Bank labels identify problems, not their full content. Missing/default zero is not a diagnosed weakness; never average these scales or infer topic contents from a problem number." },
    problem_bank_scope: { status: context.problem_bank?.status ?? "not_loaded", truncated_goal_ids: context.problem_bank?.truncated_goal_ids ?? [],
      history: "Latest 20 problem records per selected goal, explicitly linked bank subjects only; optional topic applies to the entire bank subject." },
    personal_preferences: context.personal_preferences, personal_feedback: context.personal_feedback,
    review: context.review,
    diagnosis_contract: {
      compare: ["actual required concepts/depth/prerequisites", "dated prior familiarity", "actual class progress/pace", "current self-report/scored application", "exam/assignment scope and remaining time"],
      scope: "Different evidence types, not a blended mastery score. Related learning is lexical prerequisite evidence, not verified mastery or permission to schedule that goal.",
      request_policy: "Current text is important but does not erase approaching exams or justified review. Distinguish soft emphasis from explicit exclusions. Keep exclusions, confirmed windows and selected execution goals. Candidate goals are advice only; user selection is needed before scheduling them.",
      review_policy: "Use importance/depth, last observed scope/time, conflicts or stale checks, independent practice and exam date. No fixed reread count or quiz interval; no repeated checks by difficulty alone. Search describes course demand, never the learner's knowledge.",
    },
    request_scope: "request.desired_outcome and request.constraints apply only to this generation; never persist them as profile facts. Current structured deadlines/windows also are not lifetime preferences.",
    personalization_scope: "Only this user's observed study results, understanding and structured satisfaction. Past run decisions and plan titles are not standing preferences. Repeated comparable observations may inform provisional adaptation, not permanent traits or model training. Explicit current preferences override older soft settings, not confirmed constraints or the duty to flag approaching exams and warranted review.",
    satisfaction_scope: { status: context.satisfaction?.status ?? "not_loaded", truncated_goal_ids: context.satisfaction?.truncated_goal_ids ?? [],
      history: "Latest 20 per goal, one mutable satisfaction observation per run. Satisfaction is not mastery or learning effectiveness; had_one_off_request flags situational requests whose text is deliberately unavailable." },
    understanding_history_scope:{truncated_goal_ids:context.understanding_history?.truncated_goal_ids??[],
      history:"Latest 20 self-report observations per goal; latest-state observation IDs are omitted from previous_understanding to avoid double-counting. No chat or memo text."},
    history_scope: "Latest 20 recorded study sessions per selected goal; feedback from latest 30 owned runs, up to 20 events. Not a complete lifetime history.",
    blocked_events: context.blocked_events, recurring_blocks: context.recurring_blocks,
    course_progress_scope: context.course_progress_scope, evidence_limits: context.evidence_limits,
  } };
}

export function buildModelInput(request: CoachingRequest, source: CoachingContext) {
  return { input_schema_version: MODEL_INPUT_VERSION, request, ...buildEvidenceContext(source) };
}
