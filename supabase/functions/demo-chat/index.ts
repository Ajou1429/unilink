import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient } from '../_shared/supabaseAdmin.ts';
import { readLimitedBody, RequestError } from '../_shared/requestLimits.ts';
import { demoInstructions, demoSchema, validateDemoResult } from '../_shared/demoChat.ts';

export async function handleDemoChat(req: Request): Promise<Response> {
  const options = handleOptions(req); if (options) return options;
  if(req.method !== 'POST') return jsonResponse({error:'method not allowed'},{status:405});
  try {
    if(Deno.env.get('PUBLIC_DEMO_AI_ENABLED') !== 'true') throw new RequestError('데모 AI가 아직 활성화되지 않았습니다.',503);
    // Supabase gateway forwards the caller network. Fail closed if it is unavailable.
    const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if(!address || address.length>100) throw new RequestError('접속 정보를 확인하지 못했습니다.',503);
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if(!secret || !apiKey) throw new RequestError('데모 AI 설정이 필요합니다.',503);
    const hmac = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const visitor = [...new Uint8Array(await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode('unilink-demo:'+address)))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const body = JSON.parse(new TextDecoder().decode(await readLimitedBody(req,32768,AbortSignal.timeout(10000))));
    const db = getAdminClient();
    const reserve = async(kind:string) => {
      const {data,error} = await db.rpc('reserve_demo_usage',{p_visitor:visitor,p_kind:kind});
      if(error || !data) throw new RequestError('데모 이용 한도를 확인하지 못했습니다.',503);
      return data as {allowed:boolean;remaining:number;day:string};
    };
    const quota = await reserve('status');
    if(body.status === true) return jsonResponse({quota});
    if(typeof body.message !== 'string' || !body.message.trim() || body.message.length>2000 || !Array.isArray(body.history) || body.history.length>16 || body.history.some((m:{role?:string;text?:string})=>!m || !['user','assistant'].includes(m.role??'') || typeof m.text !== 'string' || m.text.length>4000)) throw new RequestError('대화 내용을 확인해 주세요.',400);
    const chatQuota = await reserve('chat');
    if(!chatQuota.allowed) throw new RequestError('오늘 데모 대화 이용 한도에 도달했어요. 내일 다시 이용해 주세요.',429);
    const signal = AbortSignal.timeout(45000);
    const response = await fetch('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
      model:Deno.env.get('DEMO_CHAT_MODEL') || Deno.env.get('CHAT_ASSISTANT_MODEL') || 'gpt-6.1-terra',store:false,max_output_tokens:3000,instructions:demoInstructions,
      input:JSON.stringify({today:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),remaining:quota.remaining,context:body.context,history:body.history,message:body.message}),
      text:{format:{type:'json_schema',name:'demo_action',strict:true,schema:demoSchema}}
    })});
    if(!response.ok) throw new RequestError('AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.',502);
    const data=JSON.parse(new TextDecoder().decode(await readLimitedBody(response,65536,signal)));
    if(data.status!=='completed') throw new RequestError('AI 응답이 완료되지 않았습니다.',502);
    const output=(data.output??[]).filter((x:{type:string})=>x.type==='message').flatMap((x:{content:{type:string;text:string}[]})=>x.content??[]).filter((x:{type:string})=>x.type==='output_text').map((x:{text:string})=>x.text).join('');
    const result=validateDemoResult(JSON.parse(output));
    let finalQuota=quota;
    if(result.action==='plan') {
      finalQuota=await reserve('plan');
      if(!finalQuota.allowed) return jsonResponse({error:'오늘 계획 생성 3회를 모두 사용했어요. 내일 다시 이용해 주세요.',quota:finalQuota},{status:429});
    }
    return jsonResponse({result,quota:finalQuota});
  } catch(error) {
    console.error('demo-chat failed',{type:error instanceof Error?error.name:'unknown'});
    return jsonResponse({error:error instanceof RequestError?error.message:'데모 대화를 처리하지 못했습니다.'},{status:error instanceof RequestError?error.status:502});
  }
}
if(import.meta.main) Deno.serve(handleDemoChat);
