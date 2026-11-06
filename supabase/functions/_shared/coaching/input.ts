import type { CoachingContext, CoachingRequest } from "./contract.ts";
import { modelContext } from "./context.ts";

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
      deadlines: context.deadlines.filter((row) => row.goal_id === goal.id),
      study_history: context.recent_study.filter((row) => row.goal_id === goal.id),
      existing_plan: context.existing_items.filter((row) => row.goal_id === goal.id),
    };
    return { goal, ...evidence,
      evidence_gaps: {
        missing_records: Object.entries(evidence).filter(([, rows]) => rows.length === 0).map(([name]) => name),
        incomplete_material: evidence.course_knowledge.some((row) => row.overview_complete !== true || row.detail_complete !== true),
        truncated_material: evidence.course_knowledge.some((row) => row.context_truncated === true),
        stale_check_ids: evidence.scored_checks.filter((row) => row.source_stale).map((row) => row.attempt_id),
      } };
  });
  return { goal_briefs, shared_context: {
    timezone: context.timezone, allowed_methods: context.methods,
    blocked_events: context.blocked_events, recurring_blocks: context.recurring_blocks,
    course_progress_scope: context.course_progress_scope, evidence_limits: context.evidence_limits,
  } };
}

export function buildModelInput(request: CoachingRequest, source: CoachingContext) {
  return { input_schema_version: "coaching-evidence-v2", request, ...buildEvidenceContext(source) };
}
