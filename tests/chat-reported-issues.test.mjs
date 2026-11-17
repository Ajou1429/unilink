import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guessDocType} from '../src/lib/file-intake/classify-local.ts';
import {lectureCandidatePages} from '../src/lib/problem-bank/merge.ts';
import {parseCommands,COMMAND_KINDS} from '../supabase/functions/_shared/chatCommands.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('university syllabus structure takes precedence over exercise references',()=>{
 assert.deepEqual(guessDocType('교과목명 품질공학\n담당교수\n평가방법 중간고사 30\n주차별 계획\n연습문제\n1. a\n2. b\n3. c','portal.pdf'),{type:'syllabus',confident:true});
 assert.notEqual(guessDocType('Chapter 3 grading circuits '+ 'x'.repeat(400),'notes.pdf').type,'syllabus');
 assert.equal(guessDocType('', '강의계획서.pdf'.normalize('NFD')).type,'syllabus');
});
test('lecture candidates include follow-up page without expanding paid cap',()=>{
 assert.deepEqual(lectureCandidatePages(['Example 1 Find force','continued '.repeat(30),'definitions '.repeat(30)],40,25),[1,2]);
 assert.equal(lectureCandidatePages(['Example one','Example two','continued'],1,1).length,1);
});
test('automatic uploads do not append historical courses',()=>{
 const source=read('src/lib/file-intake/pipeline.ts');
 assert.ok(source.includes('return active.filter'));
 assert.ok(source.includes('예제 문항은 아직 추출하지'));
});
test('task completion is separate from plan completion and guarded',()=>{
 assert.ok(COMMAND_KINDS.includes('complete_task'));
 assert.equal(parseCommands([{kind:'complete_task',target_id:'task1',course_ids:[],labels:[],weekdays:[]}],{courses:[],notes:[]})[0]?.kind,'complete_task');
 const code=read('src/lib/chat-command-executor.ts');
 assert.ok(code.includes('.eq("updated_at",p.payload.expected).eq("status","scheduled").in("event_type",["assignment","project"])'));
});
test('conversation rename is independent of automatic titles and owner scoped',()=>{
 const sql=read('supabase/migrations/0043_chat_list_management.sql');
 assert.ok(sql.includes('grant update(custom_title,pinned)'));
 assert.ok(sql.includes('user_id = auth.uid()'));
 const source=read('src/lib/chat-history.ts');
 assert.ok(source.includes('.order("pinned",{ascending:false})'));
 assert.ok(source.includes('row.custom_title??row.title'));
});
