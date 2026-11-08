// Pure planning/validation: learner ratings never enter a PDF or research cache key.
export const KNOWLEDGE_VERSION = "course-knowledge-v1";
export const RESEARCH_VERSION = "course-research-v2";
export const OVERVIEW_PAGES = 10;
export const DETAIL_PAGES = 6;
export type KnowledgeNote = { id: string; title: string; version: number; updated_at: string; file_path: string | null; file_name: string | null; drive_file_id: string | null; drive_modified_time: string | null };
export type Progress = { id: string; session_date: string; memo: string | null; metadata: Record<string, unknown> };
export type KnowledgeTask = {
  id?: string; task_key: string; kind: "index" | "overview" | "detail" | "research" | "refresh";
  status?: "processing" | "ready" | "failed"; note_id: string | null; source_revision: string | null;
  source_hash: string | null; page_start: number | null; page_end: number | null;
  payload?: Record<string, unknown>; error_message?: string | null; created_at?: string;
  analysis_epoch?: string | null;
};
export type Unit = {
  title: string; page_start: number; page_end: number; week: number | null;
  concepts: string[]; prerequisites: string[]; objectives: string[];
  formulas: string[]; examples: string[]; exercises: string[]; relationships: string[];
  required_depth: string; methods: string[]; quote: string;
};
export type Extraction = {
  summary: string; readable: boolean;
  sections: { kind: "syllabus" | "lecture" | "lab" | "assignment" | "exam" | "reference"; page_start: number; page_end: number; quote: string }[];
  syllabus: { field: "description" | "objectives" | "credits" | "prerequisites" | "weekly_schedule" | "assessment" | "assignment_dates" | "exam_dates" | "textbooks"; value: string; page: number; quote: string }[];
  units: Unit[]; uncertainty: string;
};
const str = { type: "string" };
const strings = { type: "array", items: str };
function object(properties: Record<string, unknown>) { return { type: "object", additionalProperties: false, properties, required: Object.keys(properties) }; }
export const extractionSchema = object({
  summary: str, readable: { type: "boolean" },
  sections: { type: "array", items: object({ kind: { type: "string", enum: ["syllabus", "lecture", "lab", "assignment", "exam", "reference"] }, page_start: { type: "integer" }, page_end: { type: "integer" }, quote: str }) },
  syllabus: { type: "array", items: object({ field: { type: "string", enum: ["description", "objectives", "credits", "prerequisites", "weekly_schedule", "assessment", "assignment_dates", "exam_dates", "textbooks"] }, value: str, page: { type: "integer" }, quote: str }) },
  units: { type: "array", items: object({ title: str, page_start: { type: "integer" }, page_end: { type: "integer" }, week: { type: ["integer", "null"] }, concepts: strings, prerequisites: strings, objectives: strings, formulas: strings, examples: strings, exercises: strings, relationships: strings, required_depth: str, methods: strings, quote: str }) },
  uncertainty: str,
});
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid knowledge object");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 1500): string {
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid knowledge text");
  return value.trim();
}
function list(value: unknown, max = 20): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid knowledge list");
  return value;
}
function texts(value: unknown): string[] { return list(value).map((v) => text(v, 500)); }
function page(value: unknown, start: number, end: number): number {
  if (!Number.isInteger(value) || Number(value) < start || Number(value) > end) throw new Error("Evidence page outside submitted PDF slice");
  return Number(value);
}
export function parseExtraction(raw: unknown, start: number, end: number): Extraction {
  const v = record(raw);
  if (typeof v.readable !== "boolean") throw new Error("Missing readability result");
  const result: Extraction = {
    summary: text(v.summary, 2000), readable: v.readable, uncertainty: text(v.uncertainty),
    sections: list(v.sections, 30).map((item) => {
      const s = record(item); const a = page(s.page_start, start, end); const b = page(s.page_end, a, end);
      if (!["syllabus", "lecture", "lab", "assignment", "exam", "reference"].includes(String(s.kind))) throw new Error("Invalid document kind");
      const quote = text(s.quote); if (!quote) throw new Error("Missing section evidence");
      return { kind: s.kind as Extraction["sections"][number]["kind"], page_start: a, page_end: b, quote };
    }),
    syllabus: list(v.syllabus, 40).map((item) => {
      const s = record(item);
      if (!["description", "objectives", "credits", "prerequisites", "weekly_schedule", "assessment", "assignment_dates", "exam_dates", "textbooks"].includes(String(s.field))) throw new Error("Invalid syllabus field");
      const quote = text(s.quote); if (!quote) throw new Error("Missing syllabus evidence");
      return { field: s.field as Extraction["syllabus"][number]["field"], value: text(s.value, 2000), page: page(s.page, start, end), quote };
    }),
    units: list(v.units, 25).map((item) => {
      const u = record(item); const a = page(u.page_start, start, end); const b = page(u.page_end, a, end);
      if (u.week !== null && (!Number.isInteger(u.week) || Number(u.week) < 1 || Number(u.week) > 52)) throw new Error("Invalid week");
      const title = text(u.title, 200); const quote = text(u.quote);
      if (!title || !quote) throw new Error("Missing unit evidence");
      return { title, page_start: a, page_end: b, week: u.week as number | null,
        concepts: texts(u.concepts), prerequisites: texts(u.prerequisites), objectives: texts(u.objectives),
        formulas: texts(u.formulas), examples: texts(u.examples), exercises: texts(u.exercises), relationships: texts(u.relationships),
        required_depth: text(u.required_depth, 1000), methods: texts(u.methods), quote };
    }),
  };
  if (!result.readable && (result.units.length || result.syllabus.length)) throw new Error("Unreadable PDF cannot contain confirmed extraction");
  return result;
}
export function revision(note: KnowledgeNote): string {
  return JSON.stringify([note.version, note.updated_at, note.file_path, note.drive_file_id, note.drive_modified_time]);
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (v) => v.toString(16).padStart(2, "0")).join("");
}
function ranges(start: number, end: number, size: number): [number, number][] {
  const result: [number, number][] = [];
  for (let a = start; a <= end; a += size) result.push([a, Math.min(a + size - 1, end)]);
  return result;
}
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function researchIdentity(value: unknown) {
  const v = record(value);
  return { title: normalize(String(v.title)), concepts: [...new Set(texts(v.concepts).map(normalize))].sort(), depth: normalize(String(v.depth)) };
}
const legacy = (p: Progress) => p.metadata?.legacy_record && typeof p.metadata.legacy_record === "object" ? p.metadata.legacy_record as Record<string, unknown> : {};
export type KnowledgePlan = { tasks: KnowledgeTask[]; active: KnowledgeTask[]; warnings: string[]; overview_complete: boolean; detail_complete: boolean; pdf_count: number; pdf_ready: number; research_status: "disabled" | "unavailable" | "pending" | "ready" | "failed"; actual_progress: { id: string; date: string; title: string; mapped: boolean }[] };

// Index keys track note revisions; expensive model results track bytes + model + prompt.
export async function planKnowledge(notes: KnowledgeNote[], progress: Progress[], saved: KnowledgeTask[], model: string, searchModel: string | null): Promise<KnowledgePlan> {
  const ready = saved.filter((t) => t.status === "ready");
  const tasks: KnowledgeTask[] = []; const active: KnowledgeTask[] = []; const warnings: string[] = [];
  const actual: KnowledgePlan["actual_progress"] = [];
  let overviewComplete = true; let detailComplete = true; let pdfReady = 0;
  const epoch = (note: KnowledgeNote) => ready.filter((t) => t.kind === "refresh" && t.note_id === note.id)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || b.task_key.localeCompare(a.task_key))[0]?.task_key ?? null;
  const add = async (kind: KnowledgeTask["kind"], note: KnowledgeNote | null, hash: string | null, a: number | null, b: number | null, extra: unknown = null) => {
    const sourceRevision = note ? revision(note) : null;
    const analysisEpoch = note ? epoch(note) : null;
    const key = await digest([kind === "research" ? RESEARCH_VERSION : KNOWLEDGE_VERSION, kind, kind === "research" ? searchModel : model, note?.id, kind === "index" ? sourceRevision : hash, a, b, kind === "research" ? researchIdentity(extra) : extra, analysisEpoch]);
    const previous = saved.find((t) => t.task_key === key);
    const task: KnowledgeTask = { ...previous, task_key: key, kind, note_id: note?.id ?? null, source_revision: sourceRevision, source_hash: hash, page_start: a, page_end: b, analysis_epoch: analysisEpoch,
      ...(kind === "research" ? { payload: { ...previous?.payload, concepts: extra } } : {}) };
    // Retain saved research payload for context; extra is only its request on a cache miss.
    if (previous?.status === "ready") { active.push(previous); return previous; }
    tasks.push(task); return null;
  };
  const units: { note: KnowledgeNote; hash: string; unit: Unit }[] = [];
  for (const note of notes) {
    const index = await add("index", note, null, null, null);
    if (!index) { overviewComplete = false; detailComplete = false; continue; }
    const count = Number(index.payload?.page_count); const hash = String(index.payload?.source_hash ?? "");
    if (!Number.isInteger(count) || count < 1 || count > 50 || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid stored PDF index");
    let complete = true;
    for (const [a, b] of ranges(1, count, OVERVIEW_PAGES)) {
      const overview = await add("overview", note, hash, a, b);
      if (!overview) { complete = false; overviewComplete = false; continue; }
      const extraction = parseExtraction(overview.payload?.extraction, a, b);
      if (!extraction.readable) warnings.push(`Unreadable PDF: ${note.title} (${a}-${b})`);
      units.push(...extraction.units.map((unit) => ({ note, hash, unit })));
    }
    if (complete) pdfReady++;
  }
  // Class progress is independent of material availability and learner self-reports.
  for (const p of progress) {
    const l = legacy(p); const title = String(l.progressTitle ?? p.memo ?? "").slice(0, 300);
    const noteId = typeof l.noteId === "string" ? l.noteId : null;
    const noteTitle = typeof l.noteTitle === "string" ? l.noteTitle : null;
    const named = notes.filter((n) => noteId ? n.id === noteId : noteTitle && n.title === noteTitle);
    const start = Number(l.pageStart); const end = Number(l.pageEnd || l.pageStart);
    let targets: { note: KnowledgeNote; hash: string; start: number; end: number }[] = [];
    if (named.length === 1 && Number.isInteger(start) && start >= 1 && Number.isInteger(end) && end >= start) {
      const index = active.find((t) => t.kind === "index" && t.note_id === named[0].id);
      if (index && end <= Number(index.payload?.page_count)) targets = [{ note: named[0], hash: String(index.payload?.source_hash), start, end }];
    } else if (normalize(title).length >= 3) {
      const matches = units.filter(({ unit }) => {
        const phrase = normalize(title); const names = [unit.title, ...unit.concepts].map(normalize).filter((s) => s.length >= 3);
        return names.some((name) => phrase.includes(name) || name.includes(phrase));
      });
      // Ambiguous matches are not silently interpreted as actual course coverage.
      if (matches.length === 1) targets = matches.map(({ note, hash, unit }) => ({ note, hash, start: unit.page_start, end: unit.page_end }));
    }
    actual.push({ id: p.id, date: p.session_date, title, mapped: targets.length > 0 });
    if (!targets.length) { detailComplete = false; warnings.push(`Progress needs a unique note/page reference: ${title || p.session_date}`); }
    for (const target of targets) {
      const covered = ready.filter((t) => t.kind === "detail" && t.note_id === target.note.id && t.source_hash === target.hash &&
        t.payload?.version === KNOWLEDGE_VERSION && t.payload?.model === model && (t.payload?.analysis_epoch ?? null) === epoch(target.note) &&
        Number(t.page_start) <= target.end && Number(t.page_end) >= target.start).sort((a, b) => Number(a.page_start) - Number(b.page_start));
      for (const artifact of covered) {
        if (!active.includes(artifact)) active.push(artifact);
        if (!(artifact.payload?.extraction as Extraction)?.readable) { detailComplete = false; warnings.push(`Unreadable detail: ${target.note.title} (${artifact.page_start}-${artifact.page_end})`); }
      }
      // Subtract all completed intervals; extending 3-5 to 3-7 reads only pages 6-7.
      let cursor = target.start;
      const missing: [number, number][] = [];
      for (const artifact of covered) {
        if (Number(artifact.page_start) > cursor) missing.push([cursor, Number(artifact.page_start) - 1]);
        cursor = Math.max(cursor, Number(artifact.page_end) + 1);
      }
      if (cursor <= target.end) missing.push([cursor, target.end]);
      for (const [start, end] of missing) for (const [a, b] of ranges(start, end, DETAIL_PAGES)) {
        if (!await add("detail", target.note, target.hash, a, b)) detailComplete = false;
      }
    }
  }
  let researchStatus: KnowledgePlan["research_status"] = searchModel ? "ready" : "disabled";
  if (overviewComplete && searchModel) {
    const knownConcepts = new Set(units.flatMap(({ unit }) => unit.concepts.map(normalize)));
    const newDetailUnits = active.filter((t) => t.kind === "detail").flatMap((t) => {
      const extraction = parseExtraction(t.payload?.extraction, t.page_start!, t.page_end!);
      return extraction.units.flatMap((unit) => {
        const fresh = unit.concepts.filter((concept) => !knownConcepts.has(normalize(concept)));
        return fresh.length ? [{ unit: { ...unit, concepts: fresh } }] : [];
      });
    });
    // Group by actual unit concepts/depth, not filename or course title. Only changed units miss this cache.
    const seen = new Set<string>();
    for (const { unit } of [...units, ...newDetailUnits]) {
      const concepts = { title: unit.title, concepts: unit.concepts, depth: unit.required_depth };
      const key = JSON.stringify(researchIdentity(concepts)); if (seen.has(key)) continue; seen.add(key);
      const result = await add("research", null, null, null, null, concepts);
      if (!result) researchStatus = "pending";
    }
    if (!seen.size) researchStatus = "unavailable";
  } else if (!overviewComplete && searchModel) researchStatus = "pending";
  const unique = [...new Map(tasks.map((t) => [t.task_key, t])).values()];
  if (unique.some((t) => t.kind === "research" && t.status === "failed")) researchStatus = "failed";
  return { tasks: unique, active, warnings: [...new Set(warnings)], overview_complete: overviewComplete, detail_complete: detailComplete,
    pdf_count: notes.length, pdf_ready: pdfReady, research_status: researchStatus, actual_progress: actual };
}

export function knowledgeContext(plan: KnowledgePlan, focus: string[] = []) {
  // This is retrieval ordering only, not a study priority/time allocation algorithm.
  const termsFrom = (values: string[]) => [...new Set(values.join(" ").toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [])]
    .filter((t) => !["study", "review", "learn", "lecture", "공부", "학습", "복습"].includes(t)).slice(0, 60);
  const terms = [...new Set([...termsFrom(focus), ...termsFrom(plan.actual_progress.map((p) => p.title))])];
  const relevance = (value: unknown) => {
    const haystack = JSON.stringify(value).toLowerCase();
    return terms.reduce((n, term) => n + Number(haystack.includes(term)), 0);
  };
  const ranked = <T>(values: T[]): T[] => values.map((value, index) => ({ value, index, score: relevance(value) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map((v) => v.value);
  const details = plan.active.filter((t) => t.kind === "detail");
  const overview = plan.active.filter((t) => t.kind === "overview");
  const relevant = new Set(details.map((t) => t.note_id));
  let remaining = 24_000; let truncated = false;
  const clipText = (value: string, limit: number) => { if (value.length > limit) truncated = true; return value.slice(0, limit); };
  const take = <T>(values: T[], count: number) => { if (values.length > count) truncated = true; return values.slice(0, count); };
  const syllabus = take(ranked(overview.flatMap((t) => ((t.payload?.extraction as Extraction)?.syllabus ?? []).map((fact) => ({
    ...fact, value: clipText(fact.value, 350), quote: clipText(fact.quote, 150), artifact_id: t.id, note_id: t.note_id,
  })))), 30);
  let includedUnits = 0; let includedArtifacts = 0;
  const bound = (tasks: KnowledgeTask[]) => tasks.flatMap((t) => {
    const e = t.payload?.extraction as Extraction | undefined;
    const clip = (values: string[], count = 4) => take(ranked(values), count).map((v) => clipText(v, 220));
    const compact = e ? { summary: clipText(e.summary, 800), readable: e.readable, uncertainty: clipText(e.uncertainty, 500),
      syllabus: take(ranked(e.syllabus), 10).map((s) => ({ ...s, value: clipText(s.value, 500), quote: clipText(s.quote, 200) })),
      units: take(ranked(e.units), t.kind === "detail" ? 4 : 3).map((u) => ({ ...u, quote: clipText(u.quote, 250), required_depth: clipText(u.required_depth, 500),
        concepts: clip(u.concepts, 6), formulas: clip(u.formulas, 3), examples: clip(u.examples, 3), exercises: clip(u.exercises, 3),
        prerequisites: clip(u.prerequisites, 3), objectives: clip(u.objectives, 3), relationships: clip(u.relationships, 3), methods: clip(u.methods, 3) })) } : undefined;
    const r = t.payload?.research as ReturnType<typeof parseResearch> | undefined;
    const research = r ? { ...r, required_depth: clipText(r.required_depth ?? "", 600), time_basis: clipText(r.time_basis ?? "", 700), uncertainty: clipText(r.uncertainty ?? "", 500),
      sources: take(ranked(r.sources), 3).map((s) => ({ ...s, relevance: clipText(s.relevance ?? "", 300), reliability: clipText(s.reliability ?? "", 300), evidence: clipText(s.evidence ?? "", 350) })) } : undefined;
    const item = { artifact_id: t.id, note_id: t.note_id, source_hash: t.source_hash, note_version: t.payload?.note_version, pages: [t.page_start, t.page_end], kind: t.kind, content: compact ?? research };
    const size = JSON.stringify(item).length;
    if (size > remaining) { truncated = true; return []; } remaining -= size;
    includedUnits += compact?.units.length ?? 0; includedArtifacts++; return [item];
  });
  const currentTitles = new Set(details.flatMap((t) => (t.payload?.extraction as Extraction)?.units?.map((u) => normalize(u.title)) ?? []));
  const researchTasks = plan.active.filter((t) => t.kind === "research").sort((a, b) =>
    Number(currentTitles.has(normalize(String((b.payload?.concepts as { title?: string })?.title ?? "")))) - Number(currentTitles.has(normalize(String((a.payload?.concepts as { title?: string })?.title ?? "")))));
  // Reserve a separate bounded budget for supplementary research so long PDFs cannot crowd it out.
  remaining = 8000; const research = bound(take(ranked(researchTasks), 4));
  remaining = 24000; const content = bound([...ranked(details), ...ranked(overview.filter((t) => relevant.has(t.note_id))), ...take(ranked(overview.filter((t) => !relevant.has(t.note_id))), 2)]);
  return { version: KNOWLEDGE_VERSION, overview_complete: plan.overview_complete, detail_complete: plan.detail_complete,
    research_status: plan.research_status, actual_class_progress: take(plan.actual_progress, 20),
    warnings: take(plan.warnings, 10), syllabus_facts: syllabus, content, research, context_truncated: truncated,
    selection: { strategy: "current_progress_and_requested_scope_lexical_relevance_with_stable_fallback",
      available_artifacts: details.length + overview.length + researchTasks.length, included_artifacts: includedArtifacts,
      available_units: [...details, ...overview].reduce((n, t) => n + ((t.payload?.extraction as Extraction)?.units?.length ?? 0), 0),
      included_units: includedUnits, limit_kind: "character_and_item_limits_not_full_course_coverage" },
    evidence_limits: "PDF quotations are model-extracted evidence, not independently verified OCR. Syllabus plans, uploaded materials, actual class progress, analysed ranges, learner completion and measured understanding are separate. External findings are supplementary estimates, never extra required syllabus. No PDF upload implies class progress." };
}

export const researchSchema = object({
  required_depth: str, prerequisites: strings, methods: strings,
  difficulty: object({ theory: { type: ["integer", "null"] }, lab: { type: ["integer", "null"] }, assignment: { type: ["integer", "null"] }, exam: { type: ["integer", "null"] } }),
  minutes_low: { type: ["integer", "null"] }, minutes_high: { type: ["integer", "null"] },
  time_basis: str, uncertainty: str,
  sources: { type: "array", items: object({ url: str, title: str, relevance: str, reliability: str, evidence: str }) },
});
export function researchSchemaForSources(urls: string[]) {
  return object({ ...researchSchema.properties,
    sources: { type: "array", items: object({ url: { type: "string", enum: urls }, title: str, relevance: str, reliability: str, evidence: str }) },
  });
}
export function parseResearch(raw: unknown, allowedUrls: Set<string>, checkedAt: string) {
  const v = record(raw); const difficulty = record(v.difficulty);
  for (const key of ["theory", "lab", "assignment", "exam"]) if (difficulty[key] !== null && (!Number.isInteger(difficulty[key]) || Number(difficulty[key]) < 1 || Number(difficulty[key]) > 5)) throw new Error("Invalid difficulty estimate");
  for (const key of ["minutes_low", "minutes_high"]) if (v[key] !== null && (!Number.isInteger(v[key]) || Number(v[key]) < 1 || Number(v[key]) > 10080)) throw new Error("Invalid time estimate");
  if ((v.minutes_low === null) !== (v.minutes_high === null) || (v.minutes_low !== null && Number(v.minutes_low) > Number(v.minutes_high))) throw new Error("Invalid time range");
  const sources = list(v.sources, 10).map((s) => {
    const r = record(s); const url = text(r.url, 2000);
    if (!allowedUrls.has(url) || !/^https?:\/\//.test(url)) throw new Error("Unretrieved research citation");
    return { url, title: text(r.title, 300), relevance: text(r.relevance, 700), reliability: text(r.reliability, 700), evidence: text(r.evidence, 1000), checked_at: checkedAt };
  });
  if (!sources.length) throw new Error("Research has no retrieved sources");
  return { required_depth: text(v.required_depth), prerequisites: texts(v.prerequisites), methods: texts(v.methods), difficulty,
    minutes_low: v.minutes_low, minutes_high: v.minutes_high, time_basis: text(v.time_basis), uncertainty: text(v.uncertainty), sources,
    classification: "AI estimates backed by retrieved references; not measured peer averages" };
}
