"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { captureStorageScope, getStorageUser } from "@/lib/private-storage";
import { COURSE_EVENTS_CHANGED_EVENT } from "@/lib/course-events";
import { TIMETABLE_CHANGED_EVENT } from "@/lib/timetable-storage";
import { sharedCalendarEvents, type SharedCalendarEvent } from "@/lib/shared-calendar-view";

export function useSharedCalendar(from: string, until: string) {
  const [events, setEvents] = useState<SharedCalendarEvent[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true, revision = 0;
    const assertAccount = captureStorageScope();
    async function load() {
      const current = ++revision;
      try {
        const db = getSupabaseBrowserClient(), owner = getStorageUser();
        if (!db || !owner) { if (active) { setEvents([]); setError(""); } return; }
        const rows = await db.from("calendar_events").select("id,goal_id,title,description,exam_scope,event_type,starts_at,ends_at,due_at,created_at,metadata")
          .eq("user_id", owner).eq("status", "scheduled")
          .or(`and(due_at.gte.${from}T00:00:00+09:00,due_at.lte.${until}T23:59:59+09:00),and(starts_at.lte.${until}T23:59:59+09:00,ends_at.gte.${from}T00:00:00+09:00)`)
          .order("created_at", { ascending: false }).limit(201);
        assertAccount();
        if (rows.error) throw new Error("DB 일정을 불러오지 못했습니다.");
        if ((rows.data?.length ?? 0) > 200) throw new Error("표시할 DB 일정이 많습니다. 주간 범위로 확인해 주세요.");
        const ids = [...new Set((rows.data ?? []).flatMap(row => row.goal_id ? [row.goal_id] : []))];
        const goals = ids.length ? await db.from("learning_goals").select("id,title,course_id,metadata").eq("user_id", owner).in("id", ids) : { data: [], error: null };
        assertAccount();
        if (goals.error) throw new Error("일정의 과목을 확인하지 못했습니다.");
        if (active && current === revision) { setEvents(sharedCalendarEvents(rows.data ?? [], goals.data ?? [], from, until)); setError(""); }
      } catch (error) {
        if (active && current === revision) { setEvents([]); setError(error instanceof Error ? error.message : "DB 일정 조회 실패"); }
      }
    }
    void load();
    window.addEventListener(COURSE_EVENTS_CHANGED_EVENT, load);
    window.addEventListener(TIMETABLE_CHANGED_EVENT, load);
    return () => { active = false; window.removeEventListener(COURSE_EVENTS_CHANGED_EVENT, load); window.removeEventListener(TIMETABLE_CHANGED_EVENT, load); };
  }, [from, until]);
  return { events, error };
}
