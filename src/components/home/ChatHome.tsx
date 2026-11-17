"use client";

import { conversationContext, validateRecordDraftAction } from "@/lib/chat-continuity";
import { conversationTitle } from "@/lib/chat-title";
import { archivedRequestDisplay } from "@/lib/chat-request-display";

import { Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Loader2, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createConversationWriter, loadConversation, type HistoryItem } from "@/lib/chat-history";
import { snapshotThread } from "@/lib/chat-history-snapshot";
import { getStorageUser } from "@/lib/private-storage";
import { cn } from "@/lib/utils";
import { NEW_CHAT_EVENT } from "@/components/layout/Sidebar";
import {
  applyAction, editApplied, interpretMessage, loadChatContext, undoApplied,
  type AppliedEdit, type ChatContext, type ObservationIdentity,
} from "@/lib/chat-record/apply";
import {
  courseMentioned, dateKey, missingOf, pendingNote, resolveProblemAction, sameRecord, type ChatAction,
} from "@/lib/chat-record/plan";
import { ChatComposer, type ComposerSubmit } from "./ChatComposer";
import { ChatRecordCard, type RecordEntry } from "./ChatRecordCard";
import { IntakeResultRow } from "./IntakeResultRow";
import { useFileIntake } from "./useFileIntake";
import { createChatQueue } from "@/lib/chat-record/queue";
import { converse, getAssistantConsent, setAssistantConsent } from "@/lib/chat-assistant";
import { CHAT_FEATURES, type AssistantTool } from "../../../supabase/functions/_shared/chatAssistant";
import { ChatFeatureCard } from "./ChatFeatureCard";
import { getMyNotes, type MyNote } from "@/lib/my-notes-storage";
import type { IntakeRecord } from "@/lib/file-intake/settings";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-storage";
import { ChatCommandCard, type CommandStatus } from "./ChatCommandCard";
import { discardChatDrafts, discardPreparedCommand, executePreparedCommand, parseConfirmation, prepareChatCommand, type PreparedCommand } from "@/lib/chat-command-executor";
import { parseCommands, type ChatCommand } from "../../../supabase/functions/_shared/chatCommands";

import { getAgentConsent, requestServiceAgent, serviceAgentEnabled, setAgentConsent, type AgentPlan } from "@/lib/service-agent";
import type { AgentRequest } from "../../../supabase/functions/_shared/serviceAgent.ts";
import { ServiceWorkflowCard } from "./ServiceWorkflowCard";

export type ThreadItem =
  | (HistoryItem & {kind:"archive"})
  | { id: string; kind: "user"; text: string; fileNames: string[] }
  | { id: string; kind: "files"; recordIds: string[] }
  | { id: string; kind: "notice"; text: string }
  | { id: string; kind: "assistant"; text: string; pending?: boolean }
  | { id: string; kind: "records"; entries: RecordEntry[] }
  | { id: string; kind: "tools"; tools: AssistantTool[]; request: string; notes: MyNote[]; userId: string | null; goalMap: [string,string][] }
  | { id: string; kind: "command"; command: ChatCommand; source: string; status: CommandStatus; prepared?: PreparedCommand; message?: string; resume?: boolean; courseName?: string; card?: HistoryItem["card"] }
  | { id: string; kind: "workflow"; plan: AgentPlan; owner: string; text: string; prerequisiteKeys: string[]; assertActive: () => void }
  | { id: string; kind: "consent"; text: string; fileRecords?: IntakeRecord[]; attachments?: AgentRequest["attachments"]; resume?: (check: () => void) => Promise<void> };

const waitingEntries = (thread: ThreadItem[]) =>
  thread.flatMap((item) => (item.kind === "records" ? item.entries.filter((entry) => entry.status === "waiting" && entry.missing) : []));

let threadSeq = 0;
const nextId = () => `t-${Date.now()}-${++threadSeq}`;

/**
 * 홈 화면. 처음에는 Claude 메인처럼 인사말과 입력창을 가운데 두고,
 * 메시지나 파일을 보내면 대화 화면으로 바뀌어 입력창이 아래에 붙는다.
 */
export function ChatHome(props: { greeting: string; widgets?: React.ReactNode }) {
  return <Suspense fallback={<p className="p-4 text-sm">대화를 준비하고 있어요…</p>}><ChatHomeContent {...props}/></Suspense>;
}

function ChatHomeContent({ greeting, widgets }: { greeting: string; widgets?: React.ReactNode }) {
  const router=useRouter(),selectedChat=useSearchParams().get("chat");
  const writer=useRef<ReturnType<typeof createConversationWriter>|null>(null);
  const [historyLoading,setHistoryLoading]=useState(false),[historyError,setHistoryError]=useState("");
  const [saveError,setSaveError]=useState(""),[identityVersion,setIdentityVersion]=useState(0);
  const snapshot=useRef<HistoryItem[]>([]);
  function makeWriter(id:string,revision=0,initialItems:HistoryItem[]=[]) {
    return createConversationWriter(id,revision,message=>{if(writer.current?.id===id)setSaveError(message);},()=>{if(writer.current?.id===id)setSaveError("");},initialItems);
  }
  const intake = useFileIntake();
  const cancelIntake=intake.cancel;
  const [thread, setThread] = useState<ThreadItem[]>([]);
  // 대화 중에는 아래 일정 박스를 접어 대화창을 넓히고, 손잡이로 다시 펼친다
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<ChatContext | null>(null);
  const threadRef = useRef<ThreadItem[]>([]);
  const requests = useRef(createChatQueue());
  const lastFiles = useRef<Promise<IntakeRecord[]>>(Promise.resolve([]));
  const confirmations=useRef(new Set<string>());
  useEffect(() => { threadRef.current = thread; }, [thread]);

  useEffect(() => {
    const queue = requests.current;
    const reset = () => {
      const previous=writer.current;
      if(previous&&snapshot.current.length){previous.queue(snapshot.current);void previous.flush();}
      writer.current=null;snapshot.current=[];setSaveError("");setHistoryError("");setHistoryLoading(false);
      discardChatDrafts();queue.cancel(); cancelIntake(); confirmations.current.clear(); lastFiles.current=Promise.resolve([]); threadRef.current = []; setThread([]); setContext(null); setWidgetsOpen(false); };
    window.addEventListener(NEW_CHAT_EVENT, reset);
    const authReset=()=>{reset();setIdentityVersion(v=>v+1);};
    window.addEventListener(AUTH_CHANGED_EVENT, authReset);
    return () => { discardChatDrafts();queue.cancel(); window.removeEventListener(NEW_CHAT_EVENT, reset); window.removeEventListener(AUTH_CHANGED_EVENT,authReset);
      const previous=writer.current;if(previous&&snapshot.current.length){previous.queue(snapshot.current);void previous.flush();}writer.current=null; };
  }, [cancelIntake]);

  useEffect(()=>{
    if(writer.current?.id===selectedChat)return;
    let disposed=false;
    const previous=writer.current;
    if(previous&&snapshot.current.length)previous.queue(snapshot.current);
    const flushed=previous?.flush()??Promise.resolve();
    writer.current=null;snapshot.current=[];
    requests.current.cancel();discardChatDrafts();cancelIntake();confirmations.current.clear();lastFiles.current=Promise.resolve([]);
    threadRef.current=[];setThread([]);setContext(null);setSaveError("");setHistoryError("");setHistoryLoading(Boolean(selectedChat));
    if(selectedChat)void flushed.then(()=>loadConversation(selectedChat)).then(conversation=>{
      if(disposed)return;
      writer.current=makeWriter(conversation.id,conversation.revision,conversation.items);
      snapshot.current=conversation.items;
      const restored:ThreadItem[]=conversation.items.map(item=>item.draft?{
        id:item.id,kind:"command",command:item.draft.command,source:item.draft.source,status:"needs_input",resume:true,card:item.card,
        message:item.draft.status==="needs_input"?item.draft.question??"이전 요청에 필요한 정보를 이어서 알려주세요.":"이전 요청이 남아 있어요. 현재 내용으로 다시 확인한 뒤 반영할 수 있어요.",
      }:item.recordDraft?{id:item.id,kind:"records",entries:item.recordDraft.entries.map((entry,index)=>({key:`${item.id}-restored-${index}`,action:entry.action,source:entry.source,status:"waiting",missing:entry.missing,requestId:entry.requestId??crypto.randomUUID(),observedAt:entry.observedAt??new Date().toISOString(),restored:true}))}:item.kind==="user"?{id:item.id,kind:"user",text:item.text,fileNames:item.fileNames??[]}:item.kind==="assistant"?{id:item.id,kind:"assistant",text:item.text}:{...item,kind:"archive"});
      threadRef.current=restored;setThread(restored);
    }).catch(error=>{if(!disposed)setHistoryError(error instanceof Error?error.message:"대화를 불러오지 못했어요.");})
      .finally(()=>{if(!disposed)setHistoryLoading(false);});
    return ()=>{disposed=true;};
    // Writers and queues are ref-owned; selection/auth changes are the load boundaries.
  },[selectedChat,identityVersion,cancelIntake]);

  useEffect(()=>{
    if(historyLoading||!writer.current||!thread.length)return;
    snapshot.current=snapshotThread(thread,intake.records);
    writer.current.queue(snapshot.current);
  },[thread,intake.records,historyLoading]);

  useEffect(()=>{
    const flush=()=>{if(writer.current&&snapshot.current.length){writer.current.queue(snapshot.current);void writer.current.flush();}};
    const hidden=()=>{if(document.visibilityState==="hidden")flush();};
    window.addEventListener("pagehide",flush);document.addEventListener("visibilitychange",hidden);
    return ()=>{window.removeEventListener("pagehide",flush);document.removeEventListener("visibilitychange",hidden);};
  },[]);

  useEffect(() => {
    if (!thread.length) return;
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // 박스가 펼쳐지거나 접히는 애니메이션(0.3초)이 끝난 뒤 최신 메시지가 보이도록 한 번 더 맞춘다
    const timeout = window.setTimeout(() => bottom.current?.scrollIntoView({ block: "end" }), 320);
    return () => window.clearTimeout(timeout);
  }, [thread, widgetsOpen]);

  function send({ text, files }: ComposerSubmit) {
    if(historyLoading||historyError)return;
    if(!writer.current&&getStorageUser()) {
      const id=crypto.randomUUID();writer.current=makeWriter(id);
      router.replace(`/dashboard?chat=${id}`,{scroll:false});
    }
    if (serviceAgentEnabled && !activeCommand()?.resume) { sendService({ text, files }); return; }
    const items: ThreadItem[] = [{ id: nextId(), kind: "user", text, fileNames: files.map((file) => file.name) }];
    let uploaded: Promise<IntakeRecord[]> = lastFiles.current;
    if (files.length) {
      const group: ThreadItem = { id: nextId(), kind: "files", recordIds: [] };
      items.push(group);
      // 분류 결과가 만들어지는 대로 이 묶음에 붙인다
      uploaded = intake.addAndWait(files, (recordId) => setThread((prev) => prev.map((item) =>
        item.id === group.id && item.kind === "files" && !item.recordIds.includes(recordId)
          ? { ...item, recordIds: [...item.recordIds, recordId] }
          : item,
      )));
      // Attach a handler immediately, including file-only messages and canceled chats.
      void uploaded.catch(()=>{});
      lastFiles.current=uploaded;
    }
    // 첫 메시지를 보내면 일정 박스가 내려가며 대화창이 커진다
    if (thread.length === 0) setWidgetsOpen(false);
    // 직전까지의 대화(이번 메시지 제외). 되물은 질문에 글로 답하면 앞 메시지와 함께 다시 해석한다.
    const history = conversationContext(snapshotThread(thread, intake.records));
    // 아직 되묻는 중인 기록도 알려 준다. 사용자가 버튼 대신 "어제", "운영체제"처럼 글로 답하면 이어서 해석한다.
    for (const entry of waitingEntries(thread)) {
      const course = context?.courses.find((item) => item.id === entry.action.course_id);
      history.push({ role: "assistant", text: pendingNote(entry.action, entry.missing!, course?.name) });
    }
    setThread((prev) => [...prev, ...items]);
    const decision=files.length?null:parseConfirmation(text);
    if(decision) {
      const pending=activeCommand();
      if(pending) {decideCommand(pending.id,decision==="yes");return;}
      const records=[...threadRef.current].reverse().find(item=>item.kind==="records"&&item.entries.some(e=>e.restored||(e.status==="waiting"&&!e.missing)||e.status==="error"));
      if(records?.kind==="records") {decideRecords(records.id,decision==="yes");return;}
    }
    if (text) {
      const observedAt = new Date().toISOString();
      void requests.current.enqueue(async check => {
        try {
          const fileRecords=await uploaded;
          check();
          await record(text, history, check, observedAt, fileRecords);
        } catch(error) {
          try{check();}catch{return;}
          setThread(prev=>[...prev,{id:nextId(),kind:"notice",text:error instanceof Error?error.message:"첨부 파일을 처리하지 못했어요."}]);
        }
      }).catch(() => {});
    }
  }

  function sendService({ text, files }: ComposerSubmit) {
    const items: ThreadItem[] = [{ id: nextId(), kind: "user", text, fileNames: files.map((file) => file.name) }];
    const group: ThreadItem | null = files.length ? { id: nextId(), kind: "files", recordIds: [] } : null;
    if (files.length) {
      items.push(serviceAgentEnabled && text ? { id: group!.id, kind: "notice", text: "첨부 자료 처리 요청 대기 중" } : group!);
    }
    // 첫 메시지를 보내면 일정 박스가 내려가며 대화창이 커진다
    if (thread.length === 0) setWidgetsOpen(false);
    // 직전까지의 대화(이번 메시지 제외). 되물은 질문에 글로 답하면 앞 메시지와 함께 다시 해석한다.
    const history = conversationContext(snapshotThread(thread, intake.records), 6);
    // 아직 되묻는 중인 기록도 알려 준다. 사용자가 버튼 대신 "어제", "운영체제"처럼 글로 답하면 이어서 해석한다.
    for (const entry of waitingEntries(thread)) {
      const course = context?.courses.find((item) => item.id === entry.action.course_id);
      history.push({ role: "assistant", text: pendingNote(entry.action, entry.missing!, course?.name) });
    }
    setThread((prev) => [...prev, ...items]);
    const observedAt = new Date().toISOString();
    const work = async (check: () => void) => {
      try {
        if (text && serviceAgentEnabled && !getAgentConsent()) {
          setThread(prev => [...prev, { id: nextId(), kind: "consent", text, resume: work }]);
          return;
        }
        let attachments: AgentRequest["attachments"] = [];
        if (files.length && text && serviceAgentEnabled) {
          const preflight = await requestServiceAgent({ request_id: crypto.randomUUID(), message: text,
            history: history.slice(-6).map(turn => ({ ...turn, text: turn.text.slice(0, 1000) })),
            today: dateKey(new Date(observedAt)), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            attachments: files.map(file => ({ name: file.name, status: "pending", course_name: null })) });
          check();
          if (!preflight.process_attachments) {
            if (group) patchItem(group.id, () => ({ id: group.id, kind: "notice", text: "첨부 자료는 등록하지 않았습니다." }));
            await recordService(text, history, check, observedAt, [], preflight);
            return;
          }
        }
        if (files.length) {
          patchItem(group!.id, () => ({ id: group!.id, kind: "files", recordIds: [] }));
          const processed = await intake.addAndWait(files, recordId => setThread(prev => prev.map(item =>
            item.id === group!.id && item.kind === "files" && !item.recordIds.includes(recordId)
              ? { ...item, recordIds: [...item.recordIds, recordId] } : item)), check);
          check();
          attachments = processed.map(row => ({ name: row.fileName, status: row.status === "done" ? "done" : "error", course_name: row.courseName ?? null }));
          if (processed.some(row => row.status !== "done")) throw new Error("일부 자료 처리가 끝나지 않아 후속 요청을 실행하지 않았습니다. 자료 결과를 확인한 뒤 다시 요청해 주세요.");
          if (text && processed.some(row => !row.courseId)) throw new Error("자료는 받았지만 과목 분류가 끝나지 않았습니다. 파일 카드에서 과목을 확인한 뒤 코칭을 다시 요청해 주세요.");
        }
        // A file-only turn never resurrects old chat text or triggers coaching.
        if (text) await recordService(text, history, check, observedAt, attachments);
      } catch (error) {
        try { check(); } catch { return; }
        if (group) patchItem(group.id, item => item.kind === "files" && item.recordIds.length ? item : ({ id: group.id, kind: "notice", text: "첨부 자료 처리가 완료되지 않았습니다." }));
        setThread(prev => [...prev, { id: nextId(), kind: "notice", text: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." }]);
      }
    };
    void requests.current.enqueue(work).catch(() => {});
  }

  async function recordService(text: string, history: { role: "user" | "assistant"; text: string }[], assertCurrent: () => void, observedAt: string, attachments: AgentRequest["attachments"] = [], preparedPlan?: AgentPlan) {
    assertCurrent();
    if (!getAgentConsent()) {
      setThread((prev) => [...prev, { id: nextId(), kind: "consent", text, attachments }]);
      return;
    }
    const replyId = nextId();
    const say = (value: string) => patchItem(replyId, () => ({ id: replyId, kind: "assistant", text: value }));
    setThread((prev) => [...prev, { id: replyId, kind: "assistant", text: "", pending: true }]);
    try {
      const ctx = await loadChatContext();
      assertCurrent();
      setContext(ctx);
      if (!ctx.signedIn) { say("로그인 후 AI 비서와 학습 코칭을 이용할 수 있습니다."); return; }
      let plan: AgentPlan | null = null;
      const appendWorkflow = (prerequisiteKeys: string[]) => {
        if (!plan || plan.clarification || (!plan.calendar.length && !plan.coaching)) return;
        const workflow: ThreadItem = { id: nextId(), kind: "workflow", plan, owner: ctx.userId!, text, prerequisiteKeys,
          assertActive: () => {
            assertCurrent();
            const current = threadRef.current.flatMap(row => row.kind === "records" ? row.entries : []);
            if (!prerequisiteKeys.every(key => current.some(entry => entry.key === key && entry.status === "saved"))) throw new Error("선행 기록이 변경됐습니다. 저장 상태를 먼저 확인해 주세요.");
          } };
        setThread(prev => [...prev, workflow]);
      };
      if (serviceAgentEnabled) {
        say("요청을 확인하고 필요한 정보를 조회하는 중입니다…");
        plan = preparedPlan ?? await requestServiceAgent({ request_id: crypto.randomUUID(), message: text,
          history: history.slice(-6).map(turn => ({ ...turn, text: turn.text.slice(0, 1000) })),
          today: dateKey(new Date(observedAt)), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, attachments });
        assertCurrent();
        say(plan.clarification || plan.reply || (plan.route === "coaching" ? "계획 추천 조건을 확인해 주세요." : "요청을 확인했습니다."));
        if (!plan.record_learning) { appendWorkflow([]); return; }
      }
      const result = await interpretMessage(ctx, text, history.slice(-8), dateKey(new Date(observedAt)));
      assertCurrent();
      if (!result.actions.length) {
        say(result.dropped > 0 ? "말씀하신 과목이나 문항 번호를 찾지 못해 기록하지 않았어요. 시간표·문제은행에 있는 이름과 번호로 말씀해 주세요."
          : result.reply || "기록할 진도나 이해도를 찾지 못했어요. 과목과 함께 말씀해 주세요.");
        return;
      }
      say(plan?.reply || result.reply || "기록할게요.");
      const waiting = waitingEntries(threadRef.current);
      const recordsId = nextId();
      const replaced = new Set<string>();
      const entries: RecordEntry[] = result.actions.map((raw, index) => {
        // 되묻던 기록에 글로 답한 경우: 그 기록을 이번 결과로 바꾼다
        const answered = waiting.find((entry) => !replaced.has(entry.key) && sameRecord(entry.action, raw));
        if (answered) replaced.add(answered.key);
        const source = answered ? `${answered.source}\n${text}` : text;
        // 과목은 사용자가 직접 말한 경우에만 쓴다. AI가 짐작한 과목이면 되묻는다.
        const course = ctx.courses.find((item) => item.id === raw.course_id);
        const action = course && !courseMentioned(course, source.split("\n")) ? { ...raw, course_id: null } : raw;
        return { key: answered?.key ?? `${recordsId}-${index}`, source, action, status: "saving", missing: null,
          requestId: answered?.requestId ?? crypto.randomUUID(), observedAt: answered?.observedAt ?? observedAt };
      });
      setThread((prev) => [
        ...prev.map((item) => (item.kind === "records" ? { ...item, entries: item.entries.filter((entry) => !replaced.has(entry.key)) } : item)),
        { id: recordsId, kind: "records", entries },
      ]);
      // 같은 새 주제가 두 번 만들어지지 않도록 하나씩 저장한다
      for (const entry of entries) {
        await runEntry(recordsId, ctx, entry.key, entry.action, assertCurrent, { requestId: entry.requestId!, observedAt: entry.observedAt! });
      }
      if (!result.dropped) appendWorkflow(entries.map(entry => entry.key));
      else setThread(prev => [...prev, { id: nextId(), kind: "notice", text: "일부 기록의 과목·문항을 확인하지 못했습니다. 후속 일정·코칭은 실행하지 않았습니다." }]);
    } catch (error) {
      try { assertCurrent(); } catch { return; }
      say(error instanceof Error ? error.message : "대화를 기록하지 못했어요.");
    }
  }

  // ── 대화로 진도·이해도 기록 ──
  const patchItem = (id: string, patch: (item: ThreadItem) => ThreadItem) => setThread((prev) => prev.map((item) => (item.id === id ? patch(item) : item)));
  const patchEntry = (itemId: string, key: string, patch: Partial<RecordEntry>) => patchItem(itemId, (item) =>
    item.kind === "records" ? { ...item, entries: item.entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)) } : item);

  async function runEntry(itemId: string, ctx: ChatContext, key: string, action: ChatAction, assertCurrent: () => void, identity?: ObservationIdentity, confirmed=false) {
    assertCurrent();
    const resolved = resolveProblemAction(action, ctx.files);
    if (!resolved) {
      patchEntry(itemId, key, { action, missing: null, status: "error", error: "말씀하신 문항을 이 과목 문제은행에서 찾지 못했어요." });
      return;
    }
    const missing = missingOf(resolved, ctx.files);
    if (missing) { patchEntry(itemId, key, { action: resolved, missing, status: "waiting" }); return; }
    if(!confirmed) {patchEntry(itemId,key,{action:resolved,missing:null,status:"waiting"});return;}
    patchEntry(itemId, key, { action: resolved, missing: null, status: "saving" });
    try {
      const entry = findEntry(key)?.entry;
      const applied = await applyAction(ctx, resolved, identity ?? { requestId: entry?.requestId ?? crypto.randomUUID(), observedAt: entry?.observedAt ?? new Date().toISOString() }, assertCurrent);
      assertCurrent();
      patchEntry(itemId, key, { applied, status: "saved", error: undefined });
    } catch (error) {
      assertCurrent();
      patchEntry(itemId, key, { status: "error", error: error instanceof Error ? error.message : "저장하지 못했어요." });
    }
  }

  async function record(text: string, history: { role: "user" | "assistant"; text: string }[], assertCurrent: () => void, observedAt: string, fileRecords: IntakeRecord[] = []) {
    assertCurrent();
    if (getAssistantConsent() !== "granted") {
      setThread((prev) => [...prev, { id: nextId(), kind: "consent", text, fileRecords }]);
      return;
    }
    const replyId = nextId();
    const say = (value: string) => patchItem(replyId, () => ({ id: replyId, kind: "assistant", text: value }));
    setThread((prev) => [...prev, { id: replyId, kind: "assistant", text: "", pending: true }]);
    try {
      const ctx = await loadChatContext();
      assertCurrent();
      setContext(ctx);
      if (!ctx.signedIn) { say("로그인하면 일상 대화, 공부 질문과 서비스 기능 실행을 이용할 수 있어요."); return; }
      const pending=activeCommand();
      const {result,notes} = await converse(ctx, text, history.slice(-8), dateKey(new Date()),fileRecords,pending?.command);
      assertCurrent();
      const commands=result.commands?.length?result.commands:parseCommands(result.tools.filter(t=>t.feature==="study_plan"||t.feature==="pdf_analysis").slice(0,1).map(t=>({
        kind:t.feature==="study_plan"?"generate_plan":"analyze_pdf",course_id:t.course_id,note_id:t.note_id,intent:t.intent,minutes:t.daily_minutes,
        start_time:t.start_hour!==undefined?`${String(t.start_hour).padStart(2,"0")}:00`:null,end_time:t.end_hour!==undefined?`${String(t.end_hour).padStart(2,"0")}:00`:null,
      })),{courses:ctx.courses,notes});
      if(commands.length) {
        say("");
        const command=commands[0],id=nextId();
        const source=pending?.command.kind===command.kind?`${pending.source}\n${text}`:text;
        if(pending?.prepared)discardPreparedCommand(pending.prepared);
        setThread(prev=>[...prev.map(item=>item.kind==="command"&&["ready","needs_input","error"].includes(item.status)?{...item,status:"cancelled" as const,resume:false,message:item.id===pending?.id&&pending.command.kind===command.kind?"추가 답변을 반영했어요.":"새 요청으로 이전 미확정 제안은 취소했어요."}:item.kind==="records"?{...item,entries:item.entries.map(e=>!e.applied&&(e.status==="waiting"||e.status==="error")?{...e,status:"undone" as const}:e)}:item),{id,kind:"command",command,source,courseName:ctx.courses.find(c=>c.id===command.course_id)?.name,status:"preparing"}]);
        try {
          const prepared=await prepareChatCommand(command,ctx,notes,dateKey(new Date()),assertCurrent,source,fileRecords.map(f=>f.noteId).filter((s):s is string=>!!s));assertCurrent();
          patchItem(id,item=>item.kind==="command"?"question" in prepared?{...item,command:prepared.command,status:"needs_input",message:prepared.question}:{...item,command:prepared.prepared.command,status:"ready",prepared:prepared.prepared}:item);
        } catch(error) {assertCurrent();patchItem(id,item=>item.kind==="command"?{...item,status:"error",message:error instanceof Error?error.message:"요청을 준비하지 못했어요."}:item);}
        return;
      }
      if(result.tools.length&&/(열어|화면|메뉴|페이지|이동|보여|보기)/.test(text)) {
        setThread(prev=>[...prev,{id:nextId(),kind:"tools",tools:result.tools,request:text,notes,userId:ctx.userId,goalMap:[...ctx.goals]}]);
      }
      if (!result.actions.length) {
        say(result.reply || (result.dropped > 0 ? "요청한 과목이나 자료를 찾지 못했어요. 이름을 다시 알려주시겠어요?" : "공부 질문이나 실행하고 싶은 기능을 편하게 말씀해 주세요."));
        return;
      }
      say(result.reply || "기록할 내용을 확인해 주세요. 예라고 하면 저장해요.");
      const waiting = waitingEntries(threadRef.current);
      const recordsId = nextId();
      if(pending?.prepared)discardPreparedCommand(pending.prepared);
      const replaced = new Set<string>();
      const entries: RecordEntry[] = result.actions.map((raw, index) => {
        // 되묻던 기록에 글로 답한 경우: 그 기록을 이번 결과로 바꾼다
        const answered = waiting.find((entry) => !replaced.has(entry.key) && sameRecord(entry.action, raw));
        if (answered) replaced.add(answered.key);
        const source = answered ? `${answered.source}\n${text}` : text;
        // 과목은 사용자가 직접 말한 경우에만 쓴다. AI가 짐작한 과목이면 되묻는다.
        const course = ctx.courses.find((item) => item.id === raw.course_id);
        const action = course && !courseMentioned(course, source.split("\n")) ? { ...raw, course_id: null } : raw;
        return { key: `${recordsId}-${index}`, source, action, status: "saving", missing: null,
          requestId: answered?.requestId ?? crypto.randomUUID(), observedAt: answered?.observedAt ?? observedAt };
      });
      setThread((prev) => [
        ...prev.map((item) => (item.kind === "records" ? { ...item, entries: item.entries.filter((entry) => !replaced.has(entry.key)).map(e=>!e.applied&&!e.missing&&(e.status==="waiting"||e.status==="error")?{...e,status:"undone" as const}:e) } : item.kind==="command"&&["ready","needs_input","error"].includes(item.status)?{...item,status:"cancelled" as const,message:"새 기록 요청으로 이전 제안을 취소했어요."}:item)),
        { id: recordsId, kind: "records", entries },
      ]);
      // Resolve missing fields now; write only after a separate yes/no confirmation.
      for (const entry of entries) {
        await runEntry(recordsId, ctx, entry.key, entry.action, assertCurrent, { requestId: entry.requestId!, observedAt: entry.observedAt! });
      }
    } catch (error) {
      try { assertCurrent(); } catch { return; }
      say(error instanceof Error ? error.message : "대화를 기록하지 못했어요.");
    }
  }

  function activeCommand() {
    const item=[...threadRef.current].reverse().find(item=>item.kind==="command"&&["ready","needs_input","running","error"].includes(item.status));
    return item?.kind==="command"?item:null;
  }

  function resumeCommand(id:string) {
    const item=threadRef.current.find(row=>row.id===id);
    if(item?.kind!=="command"||!item.resume||!["needs_input","error"].includes(item.status)||confirmations.current.has(id))return;
    confirmations.current.add(id);
    patchItem(id,row=>row.kind==="command"?{...row,status:"preparing",resume:false}:row);
    void requests.current.enqueue(async check=>{
      try {
        const ctx=await loadChatContext();check();setContext(ctx);
        const notes=await getMyNotes();check();
        const command=parseCommands([item.command],{courses:ctx.courses,notes})[0];
        if(!command)throw new Error("이전 요청의 과목이나 자료를 찾지 못했어요. 현재 이름으로 다시 알려주세요.");
        const next=await prepareChatCommand(command,ctx,notes,dateKey(new Date()),check,item.source);check();
        patchItem(id,row=>row.kind==="command"?"question" in next?{...row,courseName:ctx.courses.find(c=>c.id===command.course_id)?.name,command:next.command,status:"needs_input",message:next.question}:{...row,courseName:ctx.courses.find(c=>c.id===command.course_id)?.name,command:next.prepared.command,status:"ready",prepared:next.prepared,message:undefined}:row);
      } catch(error) {
        try{check();}catch{return;}
        patchItem(id,row=>row.kind==="command"?{...row,status:"error",resume:true,message:error instanceof Error?error.message:"이전 요청을 확인하지 못했어요."}:row);
      }
    }).catch(()=>{}).finally(()=>confirmations.current.delete(id));
  }

  function decideCommand(id:string,yes:boolean) {
    const item=threadRef.current.find(item=>item.id===id);
    if(item?.kind!=="command"||item.status==="done"||item.status==="cancelled")return;
    if(item.status==="running"||confirmations.current.has(id))return;
    if(!yes) {
      if(item.prepared)discardPreparedCommand(item.prepared);
      const message=item.status==="error"&&item.prepared?"추가 재시도를 중단했어요. 이미 처리된 항목을 자동으로 되돌리지는 않아요.":"이 제안은 추가·저장하지 않았어요.";
      patchItem(id,x=>x.kind==="command"?{...x,status:"cancelled",message}:x);return;
    }
    if(!item.prepared) {setThread(prev=>[...prev,{id:nextId(),kind:"assistant",text:item.message??"필요한 정보를 먼저 알려주세요."}]);return;}
    const prepared=item.prepared;
    confirmations.current.add(id);
    patchItem(id,x=>x.kind==="command"?{...x,status:"running",message:undefined}:x);
    void requests.current.enqueue(async check=>{
      try {
        const result=await executePreparedCommand(prepared,check);check();
        patchItem(id,x=>x.kind==="command"?result.next?{...x,prepared:result.next,status:"ready",message:result.message}:{...x,status:"done",message:result.message}:x);
      } catch(error) {try{check();}catch{return;}patchItem(id,x=>x.kind==="command"?{...x,status:"error",message:error instanceof Error?error.message:"실행하지 못했어요."}:x);}
    }).catch(()=>{}).finally(()=>confirmations.current.delete(id));
  }

  function resumeRecords(id:string) {
    const item=threadRef.current.find(row=>row.id===id);
    if(item?.kind!=="records"||confirmations.current.has(id))return;
    confirmations.current.add(id);
    void requests.current.enqueue(async check=>{
      try {
        const ctx=await loadChatContext();check();setContext(ctx);
        if(!ctx.signedIn)throw new Error("로그인 후 이전 기록을 확인해 주세요.");
        for(const entry of item.entries.filter(e=>e.restored)) {
          const action=validateRecordDraftAction(entry.action,ctx,dateKey(new Date()));
          if(!action) {patchEntry(id,entry.key,{status:"error",restored:false,error:"이전 기록의 과목·문항을 현재 자료에서 확인하지 못했어요. 다시 알려주세요."});continue;}
          patchEntry(id,entry.key,{restored:false});
          await runEntry(id,ctx,entry.key,action,check,{requestId:entry.requestId!,observedAt:entry.observedAt!});
        }
      } catch(error) {
        try{check();}catch{return;}
        setThread(prev=>[...prev,{id:nextId(),kind:"assistant",text:error instanceof Error?error.message:"이전 학습 기록을 확인하지 못했어요."}]);
      }
    }).catch(()=>{}).finally(()=>confirmations.current.delete(id));
  }

  function decideRecords(id:string,yes:boolean) {
    const item=threadRef.current.find(item=>item.id===id);
    if(item?.kind!=="records"||confirmations.current.has(id))return;
    if(item.entries.some(e=>e.restored)){if(yes)resumeRecords(id);else item.entries.forEach(e=>patchEntry(id,e.key,{status:"undone",restored:false}));return;}
    if(!context)return;
    const entries=item.entries.filter(e=>!e.applied&&!e.missing&&(e.status==="waiting"||e.status==="error"));
    if(!yes) {entries.forEach(e=>patchEntry(id,e.key,{status:"undone"}));return;}
    confirmations.current.add(id);
    void requests.current.enqueue(async check=>{
      for(const entry of entries)await runEntry(id,context,entry.key,entry.action,check,{requestId:entry.requestId!,observedAt:entry.observedAt!},true);
    }).catch(()=>{}).finally(()=>confirmations.current.delete(id));
  }

  function answerConsent(itemId: string, text: string, value: "granted" | "declined") {
    const item=threadRef.current.find(item=>item.id===itemId);
    const fileRecords=item?.kind==="consent"?item.fileRecords:[];
    if (serviceAgentEnabled) setAgentConsent(value === "granted");
    setAssistantConsent(value);
    setThread((prev) => prev.filter((item) => item.id !== itemId));
    if (value === "granted") {
      if (serviceAgentEnabled && item?.kind === "consent" && item.resume) {
        void requests.current.enqueue(item.resume).catch(() => {}); return;
      }
      const history = conversationContext(snapshotThread(threadRef.current,intake.records));
      const observedAt = new Date().toISOString();
      void requests.current.enqueue(check => serviceAgentEnabled
        ? recordService(text, history, check, observedAt, item?.kind === "consent" ? item.attachments : [])
        : record(text, history, check, observedAt,fileRecords)).catch(() => {});
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
    void requests.current.enqueue(check => runEntry(found.itemId, context, key, { ...found.entry.action, ...patch }, check)).catch(() => {});
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

  function showFeatures() {
    setThread(prev=>[...prev,{id:nextId(),kind:"assistant",text:`어떤 기능을 실행할까요? 예: “운영체제 이번 주 계획 세워줘”, “이 PDF 분석해줘”, “문제은행 열어줘”.\n사용 가능한 기능: ${Object.values(CHAT_FEATURES).map(f=>f.label).join(" · ")}`}]);
  }
  const composer = <ChatComposer onSubmit={send} footer={<>{driveToggle}<button type="button" className="rounded-lg border px-2.5 py-1 text-xs" onClick={showFeatures}>사용 가능한 기능</button></>} autoFocus />;

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
        if (item.kind === "archive") {
          const details = item.card ?? archivedRequestDisplay(item.text, conversationTitle(thread.filter(row=>row.kind==="user")));
          return <div key={item.id} aria-label="이전 대화 내용" className="space-y-2 whitespace-pre-wrap text-[15px] leading-relaxed">{details ? <><p className="font-semibold">{details.title}</p><ul className="list-disc space-y-1 pl-5">{details.content.map((line,i)=><li key={i}>{line}</li>)}</ul>{details.dates.map((line,i)=><p key={i} className="text-sm text-muted-foreground">{line}</p>)}</> : item.text}</div>;
        }
        if (item.kind === "notice") {
          return <p key={item.id} className="text-sm text-muted-foreground">{item.text.replace(/^\s*#{1,6}\s+/gm,"")}</p>;
        }
        if (item.kind === "workflow") {
          const entries = thread.flatMap(row => row.kind === "records" ? row.entries : []);
          return <ServiceWorkflowCard key={item.id} plan={item.plan} owner={item.owner} text={item.text}
            recordsReady={item.prerequisiteKeys.every(key => entries.some(entry => entry.key === key && entry.status === "saved"))} assertActive={item.assertActive} />;
        }
        if (item.kind === "assistant") {
          if(!item.pending&&!item.text)return null;
          return item.pending
            ? <Loader2 key={item.id} className="h-4 w-4 animate-spin text-muted-foreground" aria-label="답변 준비 중" />
            : <p key={item.id} className="whitespace-pre-wrap text-[15px]">{item.text.replace(/^\s*#{1,6}\s+/gm,"")}</p>;
        }
        if (item.kind === "consent") {
          return (
            <div key={item.id} className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
              <p>대화와 최근 대화 일부, 본인 과목·노트 제목·일정·학습 계획·자기보고 이해도 일부를 AI(OpenAI)로 보내 답변하고 기능을 연결해요. 명시한 진도·이해도는 기록하며, 대화 내용과 요청·계획 결과는 본인 계정에 저장되어 다른 기기에서도 불러올 수 있어요. 보관된 실행 내역은 당시 기록이며 현재 계획 상태와 다를 수 있어요. PDF 본문 분석은 별도 동의를 받아요.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => answerConsent(item.id, item.text, "granted")} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">{serviceAgentEnabled ? "동의하고 계속" : "동의하고 대화"}</button>
                <button type="button" onClick={() => answerConsent(item.id, item.text, "declined")} className="rounded-md border bg-white px-3 py-1 text-xs">AI 대화 사용 안 함</button>
              </div>
            </div>
          );
        }
        if (item.kind === "records") {
          if(item.entries.some(e=>e.restored))return <div key={item.id} className="space-y-2 text-[15px]"><p>이전에 확인 중이던 학습 기록이 있어요. 추가 정보를 이어서 말씀하시거나 현재 내용으로 다시 확인해 주세요.</p><button type="button" className="text-sm underline underline-offset-4" onClick={()=>resumeRecords(item.id)}>학습 기록 이어서 확인</button></div>;
          return (
            <div key={item.id} className="space-y-2">
            <ChatRecordCard
              entries={item.entries}
              courses={context?.courses ?? []}
              today={dateKey(new Date())}
              files={context?.files ?? new Map()}
              onPick={pick}
              onUndo={(key) => void undo(key)}
              onEdit={(key, change) => void edit(key, change)}
            />
            {item.entries.some(e=>!e.applied&&!e.missing&&(e.status==="waiting"||e.status==="error"))&&<div className="flex items-center gap-2 text-sm"><span>확인된 내용을 기록할까요?</span><button type="button" className="rounded-lg bg-primary px-3 py-2 text-primary-foreground" onClick={()=>decideRecords(item.id,true)}>예</button><button type="button" className="rounded-lg border px-3 py-2" onClick={()=>decideRecords(item.id,false)}>아니오</button></div>}
            </div>
          );
        }
        if(item.kind==="command")return <ChatCommandCard key={item.id} subjectTitle={conversationTitle(thread.filter(row=>row.kind==="user"))} courseName={item.courseName??context?.courses.find(c=>c.id===item.command.course_id)?.name} resume={item.resume} onResume={()=>resumeCommand(item.id)} prepared={item.prepared} status={item.status} message={item.message} onDecision={yes=>decideCommand(item.id,yes)}/>;
        if(item.kind==="tools") {
          return <div key={item.id} className="space-y-3">{item.tools.map((tool,index)=><ChatFeatureCard
            key={`${item.id}-${index}`} tool={tool} goalIds={tool.course_id?item.goalMap.filter(([id])=>id===tool.course_id).map(([,goal])=>goal):[]}
            request={item.request} notes={item.notes} userId={item.userId} />)}</div>;
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
      <div ref={bottom} className="h-56 scroll-mb-56 lg:h-0 lg:scroll-mb-0" />
    </div>
  );

  // 넓은 화면에서는 페이지가 스크롤되지 않는다.
  // 처음: 인사말·입력창(위) + 일정 박스(아래)
  // 대화 중: 대화(남는 높이 전부, 안에서 스크롤) + 입력창 + 손잡이 [+ 펼치면 일정 박스]
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 sm:px-6 lg:h-full lg:min-h-0">
      {historyLoading&&<p role="status" className="py-3 text-sm">대화를 불러오는 중…</p>}
      {historyError&&<p role="alert" className="py-3 text-sm text-destructive">{historyError} 목록에서 다시 선택하거나 새 채팅을 시작해 주세요.</p>}
      {saveError&&<div role="alert" className="py-3 text-sm text-destructive">{saveError}<button type="button" className="ml-2 underline" onClick={()=>void writer.current?.flush()}>저장 재시도</button></div>}
      {!historyLoading&&!historyError&&(chatting ? (
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
      ))}

      {!historyLoading&&!historyError&&chatting && (
        <div className="sticky bottom-0 z-10 mx-auto w-full max-w-3xl shrink-0 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-50/0 pt-4 lg:static lg:pt-2">
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
