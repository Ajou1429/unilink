import { readCommandDraft, readRecordDraft, type CommandDraft, type RecordDraft } from "./chat-continuity";
import { readRequestDisplay, type RequestDisplay } from "./chat-request-display";
import { conversationTitle } from "./chat-title";
import { getSupabaseBrowserClient } from "./supabase-client";
import { captureStorageScope, getStorageUser } from "./private-storage";

export const CHAT_HISTORY_CHANGED = "unilink:chatHistoryChanged";
export interface HistoryItem {
  id: string;
  kind: "user" | "assistant" | "archive";
  text: string;
  fileNames?: string[];
  card?: RequestDisplay;
  draft?: CommandDraft;
  recordDraft?: RecordDraft;
}
export interface ConversationSummary { id: string; title: string; updated_at: string; pinned?: boolean; custom_title?: string | null }
export interface Conversation extends ConversationSummary { items: HistoryItem[]; revision: number }
const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function readHistoryItems(raw: unknown): HistoryItem[] {
  if(!Array.isArray(raw))throw new Error("대화 내역 형식이 올바르지 않아요.");
  return raw.map(item=>{
    if(!item||typeof item.id!=="string"||!["user","assistant","archive"].includes(item.kind)||typeof item.text!=="string")throw new Error("대화 내역 형식이 올바르지 않아요.");
    return {id:item.id,kind:item.kind,text:item.text,...(item.kind==="user"?{fileNames:Array.isArray(item.fileNames)?item.fileNames.filter((v:unknown)=>typeof v==="string"):[]}: {card:readRequestDisplay(item.card),draft:item.kind==="archive"?readCommandDraft(item.draft):undefined,recordDraft:item.kind==="archive"?readRecordDraft(item.recordDraft):undefined})};
  });
}
function connection() {
  const userId=getStorageUser(),check=captureStorageScope(userId),db=getSupabaseBrowserClient();
  if(!userId||!db)throw new Error("로그인 후 대화 내역을 사용할 수 있어요.");
  return {userId,check,db};
}
export async function listConversations(limit=3):Promise<{items:ConversationSummary[];more:boolean}> {
  const {userId,check,db}=connection();
  let {data,error}=await db.from("chat_conversations").select("id,title,updated_at,custom_title,pinned").eq("user_id",userId).order("pinned",{ascending:false}).order("updated_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1);
  if(error&&["42703","PGRST204"].includes(error.code)) {
    const legacy=await db.from("chat_conversations").select("id,title,updated_at").eq("user_id",userId).order("updated_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1);
    data=legacy.data as typeof data;error=legacy.error;
  }
  check();if(error)throw new Error("대화 목록을 불러오지 못했어요. 다시 시도해 주세요.");
  return {items:(data??[]).slice(0,limit).map(row=>({...row,title:row.custom_title??row.title})),more:(data??[]).length>limit};
}
export async function manageConversation(id:string,change:{title:string}|{pinned:boolean}|{remove:true}) {
  if(!validId(id))throw new Error("올바르지 않은 대화예요.");
  const {userId,check,db}=connection();
  const title="title" in change?change.title.trim():null;
  if(title!==null&&(!title||title.length>80))throw new Error("이름은 1자에서 80자까지 입력해 주세요.");
  const query="remove" in change?db.from("chat_conversations").delete():db.from("chat_conversations").update(title!==null?{custom_title:title}:{pinned:(change as {pinned:boolean}).pinned});
  const {data,error}=await query.eq("user_id",userId).eq("id",id).select("id");check();
  if(error)throw new Error("대화 관리에 실패했어요. 연결과 DB 0043 적용 상태를 확인해 주세요.");
  if(!data?.length)throw new Error("대화가 이미 삭제되었거나 접근할 수 없어요.");
  window.dispatchEvent(new Event(CHAT_HISTORY_CHANGED));
}
export async function loadConversation(id:string):Promise<Conversation> {
  if(!validId(id))throw new Error("올바르지 않은 대화 주소예요.");
  const {userId,check,db}=connection();
  const {data,error}=await db.from("chat_conversations").select("id,title,updated_at,items,revision").eq("user_id",userId).eq("id",id).single();
  check();if(error||!data)throw new Error("대화를 찾지 못했어요. 본인 계정의 대화인지 확인해 주세요.");
  return {...data,items:readHistoryItems(data.items)};
}

/** A writer belongs to one account AND one conversation. In-flight saves never adopt a new identity. */
export function createConversationWriter(id:string,revision=0,onError:(message:string)=>void=()=>{},onSaved:()=>void=()=>{},initialItems:HistoryItem[]=[]) {
  const {userId,check,db}=connection();
  let pending:HistoryItem[]|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  let chain=Promise.resolve(),last=revision>0?JSON.stringify(initialItems):"",blocked=false;
  function flush():Promise<void> {
    clearTimeout(timer);
    chain=chain.then(async()=>{
      const items=pending;pending=null;
      if(!items?.length||blocked)return;
      try {
        check();const serialized=JSON.stringify(items);if(serialized===last)return;
        if(items.length>2000||new TextEncoder().encode(serialized).length>1900000)throw new Error("이 대화가 길어 저장 한도에 도달했어요. 새 채팅을 시작해 주세요.");
        const title=conversationTitle(items);
        const {data,error}=await db.rpc("save_chat_conversation",{p_id:id,p_title:title,p_items:items,p_revision:revision});
        check();if(error) {
          if(error.code==="40001") {blocked=true;throw new Error("다른 창에서 이 대화가 변경됐어요. 현재 내용을 복사한 뒤 대화를 다시 열어 주세요.");}
          throw new Error("대화를 저장하지 못했어요. 연결을 확인한 뒤 저장 재시도를 눌러주세요.");
        }
        revision=Number(data);last=serialized;onSaved();
        if(typeof window!=="undefined")window.dispatchEvent(new Event(CHAT_HISTORY_CHANGED));
      } catch(error) {
        pending=pending??items;
        try {check();onError(error instanceof Error?error.message:"대화를 저장하지 못했어요.");}catch { /* A prior account must not update the new screen. */ }
      }
    });
    return chain;
  }
  return {id,userId,queue(items:HistoryItem[]) {pending=items;clearTimeout(timer);timer=setTimeout(()=>void flush(),350);},flush};
}
