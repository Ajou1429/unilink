"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Pin, Pencil, Trash2, X, Check } from "lucide-react";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-storage";
import { getStorageUser } from "@/lib/private-storage";
import { CHAT_HISTORY_CHANGED, listConversations, manageConversation, type ConversationSummary } from "@/lib/chat-history";
import { cn } from "@/lib/utils";

export function ChatHistoryList({onNavigate}:{onNavigate:()=>void}) {
  const selected=useSearchParams().get("chat");
  const router=useRouter();
  const [editing,setEditing]=useState<string|null>(null),[title,setTitle]=useState(""),[deleting,setDeleting]=useState<string|null>(null),[busy,setBusy]=useState(false);
  async function change(id:string,value:Parameters<typeof manageConversation>[1]) {
    setBusy(true);setError("");
    try {await manageConversation(id,value);setEditing(null);setDeleting(null);if("remove" in value&&selected===id){router.push("/dashboard");onNavigate();}}
    catch(e){setError(e instanceof Error?e.message:"변경 실패");}finally{setBusy(false);}
  }
  const [rows,setRows]=useState<ConversationSummary[]>([]),[more,setMore]=useState(false);
  const [limit,setLimit]=useState(3),[error,setError]=useState(""),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
  const generation=useRef(0);
  useEffect(()=>{
    let disposed=false;
    async function refresh(clear=false) {
      const version=++generation.current;
      if(clear){setRows([]);setMore(false);setLimit(3);}
      setError("");
      if(!getStorageUser()){setRows([]);setMore(false);setLoading(false);return;}
      setLoading(true);
      try {const page=await listConversations(clear?3:limit);if(!disposed&&generation.current===version){setRows(page.items);setMore(page.more);}}
      catch(e){if(!disposed&&generation.current===version)setError(e instanceof Error?e.message:"목록 조회 실패");}
      finally{if(!disposed&&generation.current===version)setLoading(false);}
    }
    const auth=()=>void refresh(true),changed=()=>void refresh();
    void refresh();window.addEventListener(AUTH_CHANGED_EVENT,auth);window.addEventListener(CHAT_HISTORY_CHANGED,changed);
    return ()=>{disposed=true;window.removeEventListener(AUTH_CHANGED_EVENT,auth);window.removeEventListener(CHAT_HISTORY_CHANGED,changed);};
  },[limit,retry]);
  return <div className="mt-2 space-y-0.5" aria-label="이전 채팅">
    {rows.map(row=><div key={row.id} className="min-w-0">
      <div className="flex min-w-0 items-center"><Link href={`/dashboard?chat=${encodeURIComponent(row.id)}`} onClick={onNavigate} title={row.title}
      className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm",selected===row.id?"bg-accent font-medium":"hover:bg-accent/70")}>
      {row.pinned?<Pin className="h-3.5 w-3.5 shrink-0"/>:<MessageSquare className="h-3.5 w-3.5 shrink-0"/>}<span className="truncate">{row.title}</span>
    </Link><div className="ml-auto flex shrink-0">
      <button disabled={busy} title={row.pinned?"상단 고정 해제":"상단 고정"} aria-label={row.pinned?"상단 고정 해제":"상단 고정"} className="p-1" onClick={()=>void change(row.id,{pinned:!row.pinned})}><Pin size={14}/></button>
      <button disabled={busy} title="이름 변경" aria-label="이름 변경" className="p-1" onClick={()=>{setEditing(row.id);setTitle(row.title);setDeleting(null);}}><Pencil size={14}/></button>
      <button disabled={busy} title="대화 삭제" aria-label="대화 삭제" className="p-1" onClick={()=>{setDeleting(row.id);setEditing(null);}}><Trash2 size={14}/></button>
    </div></div>
    {editing===row.id&&<form className="flex gap-1 p-1" onSubmit={e=>{e.preventDefault();void change(row.id,{title});}}><input aria-label="대화 이름" className="min-w-0 flex-1 rounded border px-2 text-sm" maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}/><button disabled={busy} title="이름 저장" aria-label="이름 저장"><Check size={16}/></button><button type="button" title="취소" aria-label="취소" onClick={()=>setEditing(null)}><X size={16}/></button></form>}
    {deleting===row.id&&<div className="p-2 text-xs"><p>이 대화를 삭제할까요? 등록한 과제·노트·학습 기록은 유지됩니다.</p><button disabled={busy} className="mt-2 mr-3 text-destructive" onClick={()=>void change(row.id,{remove:true})}>삭제</button><button onClick={()=>setDeleting(null)}>취소</button></div>}
    </div>)}
    {loading&&<p className="px-3 py-1 text-xs text-muted-foreground" role="status">대화 목록을 불러오는 중…</p>}
    {!rows.length&&!loading&&!error&&<p className="px-3 py-1 text-xs text-muted-foreground">저장된 대화가 없어요.</p>}
    {error&&<div className="px-3 py-1 text-xs"><p role="alert">{error}</p><button type="button" className="mt-1 underline" onClick={()=>setRetry(v=>v+1)}>다시 시도</button></div>}
    {more&&<button type="button" disabled={loading} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={()=>setLimit(v=>v+3)}>더보기</button>}
    {limit>3&&<button type="button" className="px-3 py-1.5 text-xs text-muted-foreground" onClick={()=>setLimit(3)}>접기</button>}
  </div>;
}
