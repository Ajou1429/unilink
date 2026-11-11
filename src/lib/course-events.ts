import { getSupabaseBrowserClient } from "./supabase-client";
import { getStorageUser } from "./private-storage";
import { flushP0Changes } from "./p0-sync";

/** 과목 페이지·대시보드의 시험/과제 추가·변경 후 목록을 다시 읽도록 알리는 이벤트 */
export const COURSE_EVENTS_CHANGED_EVENT = "unilink:courseEventsChanged";

export interface NewCourseEvent {
  courseId: string;
  kind: "exam" | "assignment";
  title: string;
  /** 과제: 마감 시각, 시험: 시작 시각 */
  at: Date;
  /** 시험 종료 시각 (없으면 시작 + 1시간) */
  end?: Date | null;
  description?: string;
  examScope?: string;
}

async function signedIn() {
  const db = getSupabaseBrowserClient();
  if (!db) throw new Error("로그인 후 사용할 수 있습니다.");
  const user = (await db.auth.getUser()).data.user;
  if (!user || getStorageUser() !== user.id) throw new Error("로그인 후 사용할 수 있습니다.");
  return { db, user };
}

/** 과목의 학습 목표(learning_goals) id. 과목 페이지의 과제·시험 목록과 같은 기준으로 찾는다. */
export async function findCourseGoalId(courseId: string) {
  const { db, user } = await signedIn();
  await flushP0Changes();
  const goals = await db.from("learning_goals").select("id,course_id,metadata")
    .eq("user_id", user.id).eq("goal_type", "course").eq("status", "active");
  if (goals.error) throw goals.error;
  const goal = goals.data?.find((row) => row.course_id === courseId || row.metadata?.legacy_record?.courseId === courseId);
  if (!goal) throw new Error("수업 동기화 후 다시 시도해 주세요.");
  return goal.id as string;
}

/** 과목에 시험·과제를 추가한다. 과목 페이지의 과제·시험 목록과 AI 코칭에 그대로 반영된다. */
export async function createCourseEvent(input: NewCourseEvent) {
  const { db, user } = await signedIn();
  const title = input.title.trim();
  if (!title) throw new Error("제목을 입력해 주세요.");
  if (Number.isNaN(input.at.getTime())) throw new Error("날짜를 입력해 주세요.");
  const goalId = await findCourseGoalId(input.courseId);
  const assignment = input.kind === "assignment";
  const start = input.at.toISOString();
  const end = assignment ? null : (input.end && input.end > input.at ? input.end : new Date(input.at.getTime() + 3600000)).toISOString();
  const result = await db.from("calendar_events").insert({
    user_id: user.id, goal_id: goalId, title, event_type: input.kind,
    description: input.description?.trim() ?? "", exam_scope: assignment ? "" : input.examScope?.trim() ?? "",
    due_at: assignment ? start : null, starts_at: assignment ? null : start, ends_at: end,
    is_blocking: !assignment, status: "scheduled",
    metadata: { schema_version: 1, source: "dashboard-quick-add" },
  }).select("id").single();
  if (result.error) throw result.error;
  window.dispatchEvent(new Event(COURSE_EVENTS_CHANGED_EVENT));
  return result.data.id as string;
}
