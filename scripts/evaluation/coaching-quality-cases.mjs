// Synthetic only: never copy production learner records or Drive documents here.
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function base(title = '데이터베이스 SQL') {
  return {
    request: {
      goal_ids: [id(1)], intent: 'weekly_plan', period_start: '2026-11-10', period_end: '2026-11-10',
      day_budgets: [{ date: '2026-11-10', minutes: 60, windows: [{ start: '19:00', end: '20:30' }] }],
      desired_outcome: '', constraints: '',
      rules: { transition_minutes: 5, break_minutes: 5, break_after_minutes: 60,
        method_minimums: { concept: 15, practice: 15, review: 15 }, max_focus_goals: 2, carryover: true },
    },
    context: {
      timezone: 'Asia/Seoul', goals: [{ id: id(1), title, goal_type: 'personal', course_id: id(2), target_date: null, importance: 3, metadata: {} }],
      topics: [], methods: ['concept', 'practice', 'review'].map(code => ({ code, display_name: code, active: true })),
      deadlines: [], sessions: [], existing_items: [],
    },
  };
}

const sqlUnit = {
  title: 'SQL LEFT JOIN', page_start: 3, page_end: 5, week: 3, concepts: ['LEFT JOIN', 'NULL', 'ON versus WHERE'],
  prerequisites: ['SELECT'], objectives: ['Keep unmatched customers in a query'], formulas: [],
  examples: ['Customers with no orders'], exercises: ['Predict unmatched rows and write a LEFT JOIN'],
  relationships: ['Filtering an order column in WHERE can remove unmatched rows'],
  required_depth: 'Write and explain a two-table LEFT JOIN preserving unmatched customers', methods: ['SQL coding'],
  quote: 'LEFT JOIN retains left rows; unmatched right columns are NULL.',
};

function material(units = [sqlUnit]) {
  return { active: [{ id: id(90), kind: 'overview', note_id: id(3), source_hash: 'synthetic-hash', page_start: 1, page_end: 10,
    payload: { note_version: 1, extraction: { summary: 'Synthetic SQL lecture', readable: true, sections: [], syllabus: [],
      units: structuredClone(units), uncertainty: 'No exam or peer-average evidence' } } }],
    warnings: [], actual_progress: [], research_status: 'disabled', overview_complete: true, detail_complete: true };
}

function assessed(correct, rating) {
  const value = base();
  value.context.topics = [{ id: id(4), goal_id: id(1), title: 'SQL LEFT JOIN', status: 'confirmed' }];
  value.context.topic_check_states = [{ id: id(5), check_id: id(6), goal_id: id(1), topic_id: id(4), correct_count: correct,
    question_count: 3, source: 'topic_check', grader_version: 'fixture', created_at: '2026-11-09T12:00:00Z',
    note_id: id(3), note_version: 1, source_stale: false }];
  value.context.topic_learning_states = [{ id: id(7), goal_id: id(1), topic_id: id(4), learning_status: 'in_progress',
    self_rating: rating, memo: '', observed_at: '2026-11-09T12:00:00Z', source: 'manual', session_id: null,
    session_date: '2026-11-09', note_id: id(3), page_start: 3, page_end: 5 }];
  value.context.sessions = [{ id: id(8), plan_item_id: id(9), goal_id: id(1), topic_id: id(4), method_code: 'practice',
    source: 'timer', actual_minutes: 25, completion_status: correct ? 'completed' : 'partial',
    started_at: '2026-11-09T10:00:00Z', created_at: '2026-11-09T10:30:00Z', metadata: {} }];
  value.knowledge = material();
  return value;
}

export function cases() {
  const sparse = base('미적분: 치환적분');
  const weak = assessed(0, 2);
  weak.context.deadlines = [{ id: id(10), goal_id: id(1), title: 'LEFT JOIN query submission', event_type: 'assignment',
    description: 'Preserve customers without orders and explain ON versus WHERE.', due_at: '2026-11-10T23:00:00+09:00', starts_at: null }];
  weak.request.day_budgets[0].minutes = 30;
  const strong = assessed(3, 5);
  const feedback = assessed(2, 3);
  feedback.context.personal_preferences = { preferred_session_minutes: 20, coaching_style: '직접 쿼리를 만들고 결과를 검증하는 실습 선호' };
  feedback.context.personal_feedback = [{ id: id(11), run_id: id(12), goal_ids: [id(1)], feedback_type: 'rejected',
    explanation: '필사와 요약 과제는 원하지 않습니다. 작은 데이터로 직접 쿼리를 만들고 예상 결과와 비교하는 실습을 원합니다.', created_at: '2026-11-09T13:00:00Z' }];
  const override = structuredClone(feedback);
  override.request.desired_outcome = '오늘은 코딩 실습을 하지 말고 NULL이 생기는 이유와 ON/WHERE 차이를 손으로 행 표를 그려 설명하고 싶다.';
  const late = base();
  late.request.desired_outcome = 'Window functions PARTITION BY: 부서별 급여 순위와 동점 순위를 구하는 쿼리를 작성한다.';
  const units = ['SELECT', 'WHERE', 'ORDER BY', 'GROUP BY', 'INNER JOIN', 'Subquery'].map((title, i) => ({
    ...structuredClone(sqlUnit), title, concepts: [title], page_start: i + 1, page_end: i + 1,
    required_depth: `Explain ${title}`, quote: `Synthetic ${title} material`, objectives: [], examples: [], exercises: [], relationships: [],
  }));
  units.push({ ...structuredClone(sqlUnit), title: 'Window functions', concepts: ['PARTITION BY', 'RANK', 'DENSE_RANK'],
    page_start: 7, page_end: 7, quote: 'RANK leaves gaps after ties; DENSE_RANK does not.',
    required_depth: 'Write per-department salary ranks and explain tied salary handling', objectives: ['Explain RANK versus DENSE_RANK'],
    examples: ['Per-department salary rank'], exercises: ['Compare tied salary ranks'], relationships: [] });
  late.knowledge = material(units);
  return [
    { name: 'sparse_optional_input', expected: 'Specific substitution-integral exercise with provisional level; no invented PDF/exam or request to fill optional fields.', ...sparse },
    { name: 'weak_urgent_30min', expected: 'LEFT JOIN remediation supporting imminent submission within 30 minutes; partial 25-minute session is not proven speed.', ...weak },
    { name: 'strong_sample_only', expected: 'New LEFT JOIN application rather than identical remediation; 3/3 is sampled performance, not full mastery.', ...strong },
    { name: 'personal_feedback', expected: 'Direct query-and-output verification; avoid rejected copying/summarizing; no permanent trait or mastery inference.', ...feedback },
    { name: 'current_request_overrides_history', expected: 'Hand-drawn row explanation and ON/WHERE comparison; current request overrides old coding preference.', ...override },
    { name: 'relevant_late_pdf_unit', expected: 'Use actual p7 RANK/DENSE_RANK evidence and tied salary completion check; disclose clipping, no extra exam syllabus.', ...late },
  ];
}
