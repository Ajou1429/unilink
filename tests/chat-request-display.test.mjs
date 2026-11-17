import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { moduleLoader, root } from '../scripts/simulation/runtime.mjs';
const load=moduleLoader(), display=load(path.join(root,'src/lib/chat-request-display.ts'));
const continuity=load(path.join(root,'src/lib/chat-continuity.ts'));
const history=load(path.join(root,'src/lib/chat-history.ts'));
const snapshot=load(path.join(root,'src/lib/chat-history-snapshot.ts'));
const command=raw=>load(path.join(root,'supabase/functions/_shared/chatCommands.ts')).parseCommands([raw],{courses:[{id:'course'}],notes:[]})[0];

test('exam and assignment previews use nouns and keep date/time in a separate footer',()=>{
 const exam=command({kind:'add_task',course_id:'course',title:'철근 콘크리트 설계 시험이 12월 15일 오전 9시에 1시간 반 동안 봐',event_type:'exam',date:'2030-12-15',start_time:'09:00',end_time:'10:30',exam_scope:'보·기둥 설계'});
 const card=display.commandDisplay(exam,{courseName:'철근 콘크리트 설계'});
 assert.equal(card.title,'철근 콘크리트 설계 시험 일자');
 assert.deepEqual(Array.from(card.content),['시험 범위: 보·기둥 설계']);
 assert.deepEqual(Array.from(card.dates),['일시: 2030-12-15 · 09:00–10:30','소요 시간: 1시간 30분']);
 const assignment=display.commandDisplay(command({kind:'add_task',course_id:'course',event_type:'project',title:'Term Project',date:'2030-12-08',start_time:'23:59',details:'기둥 및 보 설계; 손 계산; Excel 보고서 제출'}),{courseName:'철근 콘크리트 설계'});
 assert.equal(assignment.title,'철근 콘크리트 설계 과제 마감');
 assert.deepEqual(Array.from(assignment.content),['항목: Term Project','기둥 및 보 설계','손 계산','Excel 보고서 제출']);
 assert.equal(assignment.dates[0],'마감: 2030-12-08 · 23:59');
 assert.equal(display.commandDisplay(command({kind:'generate_plan',course_id:'course'}),{courseName:'철근 콘크리트 설계'}).title,'철근 콘크리트 설계 계획 추천');
});

test('reopened draft retains only bounded declarative inputs, never saved or uncertain executions',()=>{
 const input=command({kind:'add_task',course_id:'course',title:'기말시험',event_type:'exam',date:'2030-12-15',start_time:'09:00'});
 const make=status=>({id:'c',kind:'command',source:'시험 등록 요청',command:input,status,message:'종료 시각을 알려주세요.',prepared:{command:input,summary:['철근 콘크리트 설계 · 기말시험'],payload:{token:'SECRET'},id:'CAPABILITY'}});
 for(const status of ['needs_input','ready']) {
   const saved=snapshot.snapshotThread([make(status)]);
   const reloaded=history.readHistoryItems(JSON.parse(JSON.stringify(saved)));
   assert.equal(reloaded[0].draft.command.start_time,'09:00');
   assert.equal(reloaded[0].draft.command.end_time,null);
   assert.equal(reloaded[0].draft.question,'종료 시각을 알려주세요.');
   assert.ok(!JSON.stringify(saved).includes('SECRET'));assert.ok(!JSON.stringify(saved).includes('CAPABILITY'));
 }
 for(const status of ['done','cancelled','running','error'])assert.equal(snapshot.snapshotThread([make(status)])[0].draft,undefined);
 const tampered=continuity.readCommandDraft({version:1,source:'test',status:'ready',command:{...input,runId:'SECRET',payload:{token:'TOKEN'}},prepared:{id:'CAPABILITY'}});
 assert.equal(tampered.command.kind,'add_task');assert.ok(!JSON.stringify(tampered).includes('SECRET'));
 assert.equal(continuity.readCommandDraft({...tampered,status:'done'}),undefined);
});

test('conversation context includes original task, attachments, pending input and saved outcomes after reopening',()=>{
 const initial={id:'first',kind:'user',text:'철근콘크리트 실험 일정 등록',fileNames:['실험 일정.pdf']};
 const recent=Array.from({length:12},(_,i)=>({id:String(i),kind:i%2?'assistant':'user',text:`최근 대화 ${i}`}));
 const pending={id:'last',kind:'archive',text:'종료 시각을 알려주세요.',draft:continuity.readCommandDraft({version:1,source:'원래 요청',status:'needs_input',command:command({kind:'add_task',title:'시험',date:'2030-12-15'})})};
 const result=continuity.conversationContext([initial,...recent,pending]);
 assert.equal(result.length,6);assert.ok(result[0].text.includes('실험 일정.pdf'));
 assert.ok(result.at(-1).text.includes('2030-12-15'));assert.ok(result.at(-1).text.includes('미확정'));
 assert.ok(result.some(row=>row.text.includes('최근 대화 11')));
});


test('pending learning records survive reload without restoring mutation or rollback capabilities',()=>{
 const action={kind:'topic',course_id:'course',date:null,topic:'보 설계',status:'understood',rating:3,problem_labels:[],quote:'철근 콘크리트 설계 보 설계 이해했어'};
 const item={id:'record',kind:'records',entries:[{key:'entry',action,source:'철근 콘크리트 설계 보 설계 이해했어',status:'waiting',missing:null,requestId:'00000000-0000-4000-8000-000000000123',observedAt:'2026-11-17T01:00:00Z',payload:{token:'SECRET'}}]};
 const saved=snapshot.snapshotThread([item]);
 const parsed=history.readHistoryItems(JSON.parse(JSON.stringify(saved)))[0];
 assert.equal(parsed.recordDraft.entries[0].action.topic,'보 설계');
 assert.equal(parsed.recordDraft.entries[0].requestId,item.entries[0].requestId);
 assert.ok(!JSON.stringify(saved).includes('SECRET'));
 const approved=snapshot.snapshotThread([{...item,entries:[{...item.entries[0],status:'saved',applied:{token:'SECRET'}}]}]);
 assert.equal(approved[0].recordDraft,undefined);
 const current={courses:[{id:'other',name:'다른 과목',days:[]}],files:new Map()};
 assert.equal(continuity.validateRecordDraftAction(parsed.recordDraft.entries[0].action,current,'2026-11-17').course_id,null);
});
