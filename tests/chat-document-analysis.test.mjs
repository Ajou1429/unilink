import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { moduleLoader, root } from '../scripts/simulation/runtime.mjs';
const lib = moduleLoader({}, name => name.endsWith('supabase-client') ? {getSupabaseBrowserClient:()=>null} : undefined)(path.join(root,'src/lib/chat-document-analysis.ts'));
const note = {id:'note',version:2,updatedAt:'2026-11-17T00:00:00Z'};
const analysis = {noteId:'note',noteTitle:'시험 자료',version:2,updatedAt:note.updatedAt,summary:'확인된 시험 안내',candidates:[{kind:'exam',title:'보 설계 시험',description:'빨간 테두리의 전원 응시 시험',exam_scope:'보 설계',date_text:'12월 15일 09:00',page:3}]};

test('analysis context preserves observed schedule qualifiers and rejects changed or missing sources',()=>{
  const context = lib.chatDocumentContext(analysis,[note],'빨간 테두리 시험 일정');
  assert.equal(context.candidates[0].description,analysis.candidates[0].description);
  assert.equal(context.candidates[0].date_text,'12월 15일 09:00');
  assert.equal(context.partial,false);
  assert.throws(()=>lib.chatDocumentContext(analysis,[{...note,version:3}],'일정'),/변경/);
  assert.throws(()=>lib.chatDocumentContext(analysis,[],'일정'),/변경/);
});
test('large analysis excerpts prioritize relevant candidates and explicitly report partial coverage',()=>{
  const large={...analysis,summary:'요약'.repeat(1000),candidates:Array.from({length:30},(_,i)=>({kind:i===29?'exam':'topic',title:`후보 ${i}`,description:'설명'.repeat(1000),exam_scope:'범위'.repeat(800),date_text:'12월 15일'}))};
  const context=lib.chatDocumentContext(large,[note],'시험 일정');
  assert.equal(context.candidates[0].kind,'exam');
  assert.ok(JSON.stringify(context).length<=6500);
  assert.equal(context.total_candidates,30);assert.equal(context.partial,true);
});
test('classification-only and explicit no-analysis requests never enable automatic PDF analysis',()=>{
  for(const request of ['분류만 해줘','파일명만 읽어줘','본문 읽지 말고 분류해줘','PDF 분석하지 마','수업으로 분류해줘'])assert.equal(lib.allowsChatDocumentAnalysis(request),false,request);
  for(const request of ['PDF에서 시험 일정을 찾아줘','강의 노트 내용으로 계획 세워줘','이 파일을 분석해줘'])assert.equal(lib.allowsChatDocumentAnalysis(request),true,request);
});


test('expanded chat analysis permission renews old metadata grants and preserves opt-outs',()=>{
 const values=new Map([['unilink:chat-assistant-consent:v2','granted']]);
 const load=moduleLoader({}, name=>{
   if(name.endsWith('private-storage'))return {privateStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}};
 });
 const chat=load(path.join(root,'src/lib/chat-assistant.ts'));
 assert.equal(chat.getAssistantConsent(),null);
 values.set('unilink:chat-assistant-consent:v2','declined');assert.equal(chat.getAssistantConsent(),'declined');
 chat.setAssistantConsent('granted');assert.equal(chat.getAssistantConsent(),'granted');
});
