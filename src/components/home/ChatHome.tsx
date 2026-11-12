"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookMarked, BookOpen, CalendarDays, FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NEW_CHAT_EVENT } from "@/components/layout/Sidebar";
import { ChatComposer, type ComposerSubmit } from "./ChatComposer";
import { IntakeResultRow } from "./IntakeResultRow";
import { useFileIntake } from "./useFileIntake";

type ThreadItem =
  | { id: string; kind: "user"; text: string; fileNames: string[] }
  | { id: string; kind: "files"; recordIds: string[] }
  | { id: string; kind: "notice"; text: string };

const QUICK_LINKS = [
  { href: "/timetable", icon: CalendarDays, label: "시간표" },
  { href: "/study", icon: BookOpen, label: "학습 계획" },
  { href: "/ai-coaching", icon: Sparkles, label: "AI 학습코칭" },
  { href: "/notes", icon: FileText, label: "나의 노트" },
  { href: "/problem-bank", icon: BookMarked, label: "문제은행" },
];

let threadSeq = 0;
const nextId = () => `t-${Date.now()}-${++threadSeq}`;

/**
 * 홈 화면. 처음에는 Claude 메인처럼 인사말과 입력창을 가운데 두고,
 * 메시지나 파일을 보내면 대화 화면으로 바뀌어 입력창이 아래에 붙는다.
 */
export function ChatHome({ greeting, widgets }: { greeting: string; widgets?: React.ReactNode }) {
  const intake = useFileIntake();
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reset = () => setThread([]);
    window.addEventListener(NEW_CHAT_EVENT, reset);
    return () => window.removeEventListener(NEW_CHAT_EVENT, reset);
  }, []);

  useEffect(() => {
    if (thread.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread]);

  function send({ text, files }: ComposerSubmit) {
    const items: ThreadItem[] = [{ id: nextId(), kind: "user", text, fileNames: files.map((file) => file.name) }];
    if (files.length) {
      const group: ThreadItem = { id: nextId(), kind: "files", recordIds: [] };
      items.push(group);
      // 분류 결과가 만들어지는 대로 이 묶음에 붙인다
      intake.add(files, (recordId) => setThread((prev) => prev.map((item) =>
        item.id === group.id && item.kind === "files" && !item.recordIds.includes(recordId)
          ? { ...item, recordIds: [...item.recordIds, recordId] }
          : item,
      )));
    }
    if (text) items.push({ id: nextId(), kind: "notice", text: "채팅 답변 기능은 아직 연결되지 않았어요. 파일은 바로 분류돼요." });
    setThread((prev) => [...prev, ...items]);
  }

  const consentBanner = intake.signedIn && intake.consent === null && (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
      <span className="min-w-0 flex-1">파일 과목을 바로 알 수 없을 때 앞부분 일부(1~2쪽)를 AI(OpenAI)로 보내 분류해요.</span>
      <button type="button" onClick={() => intake.setConsent("granted")} className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground">동의</button>
      <button type="button" onClick={() => intake.setConsent("declined")} className="rounded-md border bg-white px-2.5 py-1">브라우저에서만 분류</button>
    </div>
  );

  const driveToggle = intake.driveConnected && (
    <button
      type="button"
      aria-pressed={intake.driveUpload}
      onClick={() => intake.setDriveUpload(!intake.driveUpload)}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-xs",
        intake.driveUpload ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
      )}
    >
      Drive에도 저장
    </button>
  );

  const composer = <ChatComposer onSubmit={send} footer={driveToggle} autoFocus />;

  if (thread.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
        <section className="mx-auto flex min-h-[58vh] max-w-2xl flex-col justify-center py-10">
          <h2 className="mb-7 flex items-center justify-center gap-3 text-center text-3xl font-semibold tracking-tight sm:text-[34px]" suppressHydrationWarning>
            <Sparkles className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            {greeting}
          </h2>
          {consentBanner}
          {composer}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {QUICK_LINKS.map(({ href, icon: Icon, label }) => (
              <Link key={href} href={href} className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </div>
        </section>
        {widgets}
      </div>
    );
  }

  const byId = new Map(intake.records.map((record) => [record.id, record]));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
      <div className="flex-1 space-y-5 py-6">
        {thread.map((item) => {
          if (item.kind === "user") {
            return (
              <div key={item.id} className="flex justify-end">
                <div className="max-w-[85%] space-y-2 rounded-2xl bg-muted px-4 py-2.5 text-[15px]">
                  {item.fileNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.fileNames.map((name, index) => (
                        <span key={`${name}-${index}`} className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs"><FileText className="h-3.5 w-3.5" />{name}</span>
                      ))}
                    </div>
                  )}
                  {item.text && <p className="whitespace-pre-wrap">{item.text}</p>}
                </div>
              </div>
            );
          }
          if (item.kind === "notice") {
            return <p key={item.id} className="text-sm text-muted-foreground">{item.text}</p>;
          }
          const records = item.recordIds.map((id) => byId.get(id)).filter((record) => record !== undefined);
          return (
            <div key={item.id} className="rounded-2xl border bg-white px-4 py-2">
              {records.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">파일을 읽는 중…</p>
              ) : (
                <ul>
                  {records.map((record) => (
                    <IntakeResultRow key={record.id} record={record} courses={intake.courses} onChange={intake.change} onRemove={intake.remove} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="sticky bottom-0 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-50/0 pb-4 pt-6">
        {consentBanner}
        {composer}
      </div>
    </div>
  );
}
