import { getSupabaseBrowserClient } from "./supabase-client";
import { captureStorageScope, getStorageUser, privateStorage } from "./private-storage";
import { flushP0Changes } from "./p0-sync";
import { describeFunctionError } from "./supabase/function-error";
import { AGENT_VERSION, parseAgentPlan, type AgentPlan, type AgentRequest, type CalendarDraft } from "../../supabase/functions/_shared/serviceAgent.ts";

export type { AgentPlan, CalendarDraft, CoachingSeed } from "../../supabase/functions/_shared/serviceAgent.ts";
export const serviceAgentEnabled = process.env.NEXT_PUBLIC_SERVICE_AGENT_ENABLED === "true";
const CONSENT_KEY = "unilink:service-agent-consent-v1";
export function getAgentConsent() { return privateStorage.getItem(CONSENT_KEY) === "granted"; }
export function setAgentConsent(granted: boolean) { privateStorage.setItem(CONSENT_KEY, granted ? "granted" : "declined"); }

export function createWorkflowGuard(owner: string, assertActive: () => void) {
  const scope = captureStorageScope(owner), expires = Date.now() + 15 * 60 * 1000;
  let cancelled = false;
  return {
    cancel() { cancelled = true; },
    assert() {
      scope(); assertActive();
      if (cancelled || Date.now() > expires) throw new Error("작업이 취소되었거나 확인 시간이 만료됐습니다. 새로 요청해 주세요.");
    },
  };
}

export async function requestServiceAgent(input: AgentRequest): Promise<AgentPlan> {
  if (!getAgentConsent()) throw new Error("통합 AI 비서 이용에 동의해 주세요.");
  const assertCurrent = captureStorageScope();
  const db = getSupabaseBrowserClient();
  if (!db) throw new Error("로그인이 필요합니다.");
  const user = (await db.auth.getUser()).data.user;
  assertCurrent();
  if (!user || user.id !== getStorageUser()) throw new Error("로그인이 필요합니다.");
  await flushP0Changes();
  assertCurrent();
  const { data, error } = await db.functions.invoke("service-agent", { body: { ...input, consent: true } });
  assertCurrent();
  if (error) throw new Error(await describeFunctionError(error, "통합 비서를 연결하지 못했습니다."));
  if (data?.version !== AGENT_VERSION || data?.request_id !== input.request_id || !["assistant", "coaching"].includes(data?.result?.route)) throw new Error("통합 비서 서버 버전을 확인해 주세요.");
  const goals = await db.from("learning_goals").select("id,title,course_id").eq("user_id", user.id).eq("status", "active");
  assertCurrent();
  if (goals.error) throw new Error("학습 목표를 확인하지 못했습니다.");
  return parseAgentPlan(data.result, data.result.route, goals.data ?? []);
}

/** Append-only preview approval: stable ID makes an uncertain network retry safe. */
export async function approveAgentCalendar(id: string, draft: CalendarDraft, owner: string, assertActive: () => void): Promise<string> {
  const assertCurrent = captureStorageScope(owner);
  const check = () => { assertCurrent(); assertActive(); };
  check();
  const db = getSupabaseBrowserClient();
  if (!db) throw new Error("로그인이 필요합니다.");
  const user = (await db.auth.getUser()).data.user;
  check();
  if (!user || user.id !== owner) throw new Error("로그인 계정이 변경됐습니다.");
  await flushP0Changes();
  check();
  const goals = await db.from("learning_goals").select("id,title,course_id").eq("user_id", owner).eq("status", "active");
  check();
  if (goals.error) throw new Error("학습 목표를 확인하지 못했습니다.");
  parseAgentPlan({ reply: "", record_learning: false, process_attachments: false, clarification: null, calendar: [draft], coaching: null }, "assistant", goals.data ?? []);
  const payload = { id, user_id: owner, goal_id: draft.goal_id, event_type: draft.kind, title: draft.title,
    description: draft.description, exam_scope: draft.exam_scope, starts_at: draft.starts_at,
    ends_at: draft.ends_at, due_at: draft.due_at, is_blocking: draft.kind !== "assignment", status: "scheduled",
    metadata: { schema_version: 1, source: "service-agent-calendar-v1" } };
  // Recheck an uncertain earlier insert; never upsert over an existing event.
  const existing = await db.from("calendar_events").select("id,user_id,goal_id,event_type,title,description,exam_scope,starts_at,ends_at,due_at,status,metadata").eq("id", id).eq("user_id", owner).maybeSingle();
  check();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const row = existing.data;
    const same = ["goal_id", "event_type", "title", "description", "exam_scope", "status"].every(key => row[key as keyof typeof row] === payload[key as keyof typeof payload])
      && ["starts_at", "ends_at", "due_at"].every(key => {
        const a = row[key as "starts_at"], b = payload[key as "starts_at"];
        return a === null && b === null || a !== null && b !== null && Date.parse(a) === Date.parse(b);
      }) && row.metadata?.source === payload.metadata.source;
    if (!same) throw new Error("이 일정이 이미 변경됐습니다. 새 요청으로 확인해 주세요.");
    return row.id;
  }
  const saved = await db.from("calendar_events").insert(payload).select("id").single();
  check();
  if (saved.error || !saved.data?.id) throw new Error("일정 저장 결과를 확인하지 못했습니다. 같은 카드에서 다시 확인해 주세요.");
  window.dispatchEvent(new Event("unilink:studyPlansChanged"));
  window.dispatchEvent(new Event("unilink:timetableChanged"));
  return saved.data.id;
}
