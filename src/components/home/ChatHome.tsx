"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NEW_CHAT_EVENT } from "@/components/layout/Sidebar";
import {
  applyAction, editApplied, getChatConsent, interpretMessage, loadChatContext, setChatConsent, undoApplied,
  type AppliedEdit, type ChatContext,
} from "@/lib/chat-record/apply";
import { dateKey, missingOf, resolveProblemAction, type ChatAction } from "@/lib/chat-record/plan";
import { ChatComposer, type ComposerSubmit } from "./ChatComposer";
import { ChatRecordCard, type RecordEntry } from "./ChatRecordCard";
import { IntakeResultRow } from "./IntakeResultRow";
import { useFileIntake } from "./useFileIntake";

type ThreadItem =
  | { id: string; kind: "user"; text: string; fileNames: string[] }
  | { id: string; kind: "files"; recordIds: string[] }
  | { id: string; kind: "notice"; text: string }
  | { id: string; kind: "assistant"; text: string; pending?: boolean }
  | { id: string; kind: "records"; entries: RecordEntry[] }
  | { id: string; kind: "consent"; text: string };

let threadSeq = 0;
const nextId = () => `t-${Date.now()}-${++threadSeq}`;

/**
 * 홈 화면. 처음에는 Claude 메인처럼 인사말과 입력창을 가운데 두고,
 * 메시지나 파일을 보내면 대화 화면으로 바뀌어 입력창이 아래에 붙는다.
 */
export function ChatHome({ greeting, widgets }: { greeting: string; widgets?: React.ReactNode }) {
  const intake = useFileIntake();
  const [thread, setThread] = useState<ThreadItem[]>([]);
  // 대화 중에는 아래 일정 박스를 접어 대화창을 넓히고, 손잡이로 다시 펼친다
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<ChatContext | null>(null);
  const threadRef = useRef<ThreadItem[]>([]);
  useEffect(() => { threadRef.current = thread; }, [thread]);

  useEffect(() => {
    const reset = () => { setThread([]); setWidgetsOpen(false); };
    window.addEventListener(NEW_CHAT_EVENT, reset);
    return () => window.removeEventListener(NEW_CHAT_EVENT, reset);
  }, []);

  useEffect(() => {
    if (!thread.length) return;
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // 박스가 펼쳐지거나 접히는 애니메이션(0.3초)이 끝난 뒤 최신 메시지가 보이도록 한 번 더 맞춘다
    const timeout = window.setTimeout(() => bottom.current?.scrollIntoView({ block: "end" }), 320);
    return () => window.clearTimeout(timeout);
  }, [thread, widgetsOpen]);

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
    // 첫 메시지를 보내면 일정 박스가 내려가며 대화창이 커진다
    if (thread.length === 0) setWidgetsOpen(false);
    // 직전까지의 대화(이번 메시지 제외). 되물은 질문에 글로 답하면 앞 메시지와 함께 다시 해석한다.
    const history = thread.flatMap((item): { role: "user" | "assistant"; text: string }[] =>
      item.kind === "user" && item.text ? [{ role: "user", text: item.text }]
        : item.kind === "assistant" && item.text ? [{ role: "assistant", text: item.text }] : []).slice(-6);
    setThread((prev) => [...prev, ...items]);
    if (text) void record(text, history);
  }

  // ── 대화로 진도·이해도 기록 ──
  const patchItem = (id: string, patch: (item: ThreadItem) => ThreadItem) => setThread((prev) => prev.map((item) => (item.id === id ? patch(item) : item)));
  const patchEntry = (itemId: string, key: string, patch: Partial<RecordEntry>) => patchItem(itemId, (item) =>
    item.kind === "records" ? { ...item, entries: item.entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)) } : item);

  async function runEntry(itemId: string, ctx: ChatContext, key: string, action: ChatAction) {
    const resolved = resolveProblemAction(action, ctx.files);
    if (!resolved) {
      patchEntry(itemId, key, { action, missing: null, status: "error", error: "말씀하신 문항을 이 과목 문제은행에서 찾지 못했어요." });
      return;
    }
    const missing = missingOf(resolved, ctx.files);
    if (missing) { patchEntry(itemId, key, { action: resolved, missing, status: "waiting" }); return; }
    patchEntry(itemId, key, { action: resolved, missing: null, status: "saving" });
    try {
      const applied = await applyAction(ctx, resolved);
      patchEntry(itemId, key, { applied, status: "saved", error: undefined });
    } catch (error) {
      patchEntry(itemId, key, { status: "error", error: error instanceof Error ? error.message : "저장하지 못했어요." });
    }
  }

  async function record(text: string, history: { role: "user" | "assistant"; text: string }[]) {
    if (getChatConsent() !== "granted") {
      setThread((prev) => [...prev, { id: nextId(), kind: "consent", text }]);
      return;
    }
    const replyId = nextId();
    const say = (value: string) => patchItem(replyId, () => ({ id: replyId, kind: "assistant", text: value }));
    setThread((prev) => [...prev, { id: replyId, kind: "assistant", text: "", pending: true }]);
    try {
      const ctx = await loadChatContext();
      setContext(ctx);
      if (!ctx.signedIn) { say("로그인하면 대화 내용으로 진도·이해도가 기록돼요."); return; }
      const result = await interpretMessage(ctx, text, history, dateKey(new Date()));
      say(result.reply || (result.actions.length ? "기록할게요." : "기록할 진도나 이해도를 찾지 못했어요. 과목과 함께 말씀해 주세요."));
      if (!result.actions.length) return;
      const recordsId = nextId();
      const entries: RecordEntry[] = result.actions.map((action, index) => ({ key: `${recordsId}-${index}`, action, status: "saving", missing: null }));
      // 앞에서 되묻던 기록은 이번 답으로 다시 해석했으므로 지운다
      setThread((prev) => [
        ...prev.map((item) => (item.kind === "records" ? { ...item, entries: item.entries.filter((entry) => entry.status !== "waiting") } : item)),
        { id: recordsId, kind: "records", entries },
      ]);
      await Promise.all(entries.map((entry) => runEntry(recordsId, ctx, entry.key, entry.action)));
    } catch (error) {
      say(error instanceof Error ? error.message : "대화를 기록하지 못했어요.");
    }
  }

  function answerConsent(itemId: string, text: string, value: "granted" | "declined") {
    setChatConsent(value);
    setThread((prev) => prev.filter((item) => item.id !== itemId));
    if (value === "granted") {
      const history = threadRef.current.flatMap((item) => item.kind === "assistant" && item.text ? [{ role: "assistant" as const, text: item.text }] : []).slice(-3);
      void record(text, history);
    }
  }

  function findEntry(key: string) {
    for (const item of threadRef.current) {
      if (item.kind !== "records") continue;
      const entry = item.entries.find((candidate) => candidate.key === key);
      if (entry) return { itemId: item.id, entry };
    }
    return null;
  }

  function pick(key: string, patch: Partial<ChatAction>) {
    const found = findEntry(key);
    if (!found || !context) return;
    void runEntry(found.itemId, context, key, { ...found.entry.action, ...patch });
  }

  async function undo(key: string) {
    const found = findEntry(key);
    if (!found?.entry.applied) return;
    patchEntry(found.itemId, key, { status: "undoing" });
    try {
      await undoApplied(found.entry.applied);
      patchEntry(found.itemId, key, { status: "undone", error: undefined });
    } catch (error) {
      patchEntry(found.itemId, key, { status: "saved", error: error instanceof Error ? error.message : "되돌리지 못했어요." });
    }
  }

  async function edit(key: string, change: AppliedEdit) {
    const found = findEntry(key);
    if (!found?.entry.applied) return;
    patchEntry(found.itemId, key, { status: "saving" });
    try {
      const applied = await editApplied(found.entry.applied, change);
      patchEntry(found.itemId, key, { applied, status: "saved", error: undefined });
    } catch (error) {
      patchEntry(found.itemId, key, { status: "saved", error: error instanceof Error ? error.message : "고치지 못했어요." });
    }
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

  const chatting = thread.length > 0;
  const showWidgets = Boolean(widgets) && (!chatting || widgetsOpen);
  const byId = new Map(intake.records.map((record) => [record.id, record]));

  const conversation = (
    <div className="mx-auto w-full max-w-3xl space-y-5 py-6">
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
        if (item.kind === "assistant") {
          return item.pending
            ? <Loader2 key={item.id} className="h-4 w-4 animate-spin text-muted-foreground" aria-label="답변 준비 중" />
            : <p key={item.id} className="whitespace-pre-wrap text-[15px]">{item.text}</p>;
        }
        if (item.kind === "consent") {
          return (
            <div key={item.id} className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              <p>대화 내용을 AI(OpenAI)로 보내 과목·진도·이해도를 찾아 저장해요. 대화 원문은 서버에 남기지 않아요.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => answerConsent(item.id, item.text, "granted")} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">동의하고 기록</button>
                <button type="button" onClick={() => answerConsent(item.id, item.text, "declined")} className="rounded-md border bg-white px-3 py-1 text-xs">기록하지 않기</button>
              </div>
            </div>
          );
        }
        if (item.kind === "records") {
          return (
            <ChatRecordCard
              key={item.id}
              entries={item.entries}
              courses={context?.courses ?? []}
              today={dateKey(new Date())}
              files={context?.files ?? new Map()}
              onPick={pick}
              onUndo={(key) => void undo(key)}
              onEdit={(key, change) => void edit(key, change)}
            />
          );
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
  );

  // 넓은 화면에서는 페이지가 스크롤되지 않는다.
  // 처음: 인사말·입력창(위) + 일정 박스(아래)
  // 대화 중: 대화(남는 높이 전부, 안에서 스크롤) + 입력창 + 손잡이 [+ 펼치면 일정 박스]
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 sm:px-6 lg:h-full lg:min-h-0">
      {chatting ? (
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{conversation}</div>
      ) : (
        <section className="mx-auto flex w-full max-w-2xl flex-col justify-center py-10 lg:min-h-0 lg:flex-1 lg:py-4">
          <h2 className="mb-6 flex items-center justify-center gap-3 text-center text-3xl font-semibold tracking-tight sm:text-[34px]" suppressHydrationWarning>
            <Sparkles className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            {greeting}
          </h2>
          {consentBanner}
          {composer}
        </section>
      )}

      {chatting && (
        <div className="sticky bottom-0 mx-auto w-full max-w-3xl shrink-0 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-50/0 pt-4 lg:static lg:pt-2">
          {consentBanner}
          {composer}
          {widgets && (
            <button
              type="button"
              aria-expanded={widgetsOpen}
              aria-label={widgetsOpen ? "오늘 계획·시험·과제·오늘 수업 접기" : "오늘 계획·시험·과제·오늘 수업 펼치기"}
              title={widgetsOpen ? "접기" : "오늘 계획·시험·과제·오늘 수업 보기"}
              onClick={() => setWidgetsOpen((value) => !value)}
              className="group mx-auto my-1.5 flex h-5 w-56 items-center justify-center rounded-full bg-slate-200/70 text-muted-foreground transition-colors hover:bg-slate-300/80 hover:text-foreground"
            >
              {widgetsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          )}
        </div>
      )}

      {widgets && (
        <div
          inert={!showWidgets}
          className={cn(
            "overflow-hidden transition-[flex-basis,opacity] duration-300 ease-out lg:min-h-0 lg:flex-none",
            showWidgets ? "pb-6 opacity-100" : "max-lg:hidden opacity-0 lg:pointer-events-none",
            !chatting ? "lg:basis-[52%]" : showWidgets ? "lg:basis-[40%]" : "lg:basis-0",
          )}
        >
          {widgets}
        </div>
      )}
    </div>
  );
}
