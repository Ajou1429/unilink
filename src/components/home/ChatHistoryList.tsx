"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-storage";
import { getStorageUser } from "@/lib/private-storage";
import { CHAT_HISTORY_CHANGED, listConversations, type ConversationSummary } from "@/lib/chat-history";
import { cn } from "@/lib/utils";

export function ChatHistoryList({onNavigate}:{onNavigate:()=>void}) {
  const selected=useSearchParams().get("chat");
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
    {rows.map(row=><Link key={row.id} href={`/dashboard?chat=${encodeURIComponent(row.id)}`} onClick={onNavigate} title={row.title}
      className={cn("flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm",selected===row.id?"bg-accent font-medium":"hover:bg-accent/70")}>
      <MessageSquare className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{row.title}</span>
    </Link>)}
    {loading&&<p className="px-3 py-1 text-xs text-muted-foreground" role="status">대화 목록을 불러오는 중…</p>}
    {!rows.length&&!loading&&!error&&<p className="px-3 py-1 text-xs text-muted-foreground">저장된 대화가 없어요.</p>}
    {error&&<div className="px-3 py-1 text-xs"><p role="alert">{error}</p><button type="button" className="mt-1 underline" onClick={()=>setRetry(v=>v+1)}>다시 시도</button></div>}
    {more&&<button type="button" disabled={loading} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={()=>setLimit(v=>v+3)}>더보기</button>}
    {limit>3&&<button type="button" className="px-3 py-1.5 text-xs text-muted-foreground" onClick={()=>setLimit(3)}>접기</button>}
  </div>;
}
