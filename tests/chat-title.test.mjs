import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationTitle, conciseChatTitle } from '../src/lib/chat-title.ts';

test('names attached document subject instead of the long user instruction, including decomposed Korean', () => {
  const request='해당 파일에서 실험 일정이 있고 빨간색 테두리가 있는 시험이 모두 참여해야하는 시험이야. 해당 시험들을 일정에 등록해줘 우리조는 10일 15시에 실험한 조우ㅑ';
  const items=[{id:'1',kind:'user',text:request,fileNames:['철근콘크리트 실험 일정'.normalize('NFD')+'.pdf']}];
  assert.equal(conversationTitle(items),'철근콘크리트 실험 일정');
  assert.equal(conciseChatTitle('### '+request),undefined);
  assert.equal(conversationTitle([{id:'1',kind:'user',text:'과제를 등록해줘'}, {id:'2',kind:'archive',text:'요청 내역 · 실행 완료\nTerm Project\n내용'}]),'Term Project');
  assert.equal(conversationTitle([{id:'1',kind:'user',text:request}]),'학습 요청');
});
