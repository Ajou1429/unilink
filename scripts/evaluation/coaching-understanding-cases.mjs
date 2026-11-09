import { cases, id } from './coaching-quality-cases.mjs';

export function understandingCases() {
  const base = cases().find(c => c.name === 'strong_sample_only');
  const definitions = [
    ['sql','데이터베이스 SQL','SQL LEFT JOIN','미매칭 행을 보존하는 LEFT JOIN과 ON/WHERE 조건 차이를 설명하고 쿼리 작성'],
    ['theory','확률론','조건부확률과 베이즈 정리','사전확률·가능도·사후확률을 구분하고 검사 양성 후 확률을 계산 및 해석'],
    ['personal','개인 학습: 파이썬 데이터 처리','CSV 결측값 처리','CSV를 읽고 결측값 처리 전후 행 수와 자료형을 검증하는 작은 파이썬 작업'],
  ];
  const result=[];
  for(const [domain,title,topic,depth] of definitions) for(const repeat of [1,2]) for(const rating of [null,1,5]) {
    const fixture=structuredClone(base);
    fixture.context.goals[0].title=title;
    fixture.context.topics[0].title=topic;
    fixture.context.sessions=[]; fixture.context.topic_check_states=[];
    fixture.context.topic_learning_states[0].self_rating=rating;
    fixture.request.desired_outcome=depth;
    fixture.context.course_knowledge=[{goal_id:id(1),overview_complete:true,detail_complete:true,context_truncated:false,research_status:'disabled',
      content:[{artifact_id:id(90),note_id:id(3),pages:[3,5],kind:'detail',content:{readable:true,summary:topic,
        units:[{unit_ref:`synthetic-${domain}-p3-5`,title:topic,page_start:3,page_end:5,required_depth:depth,
          prerequisites:domain==='sql'?['SELECT']:domain==='theory'?['분수와 확률의 곱셈법칙']:['변수, 리스트, 딕셔너리'],
          objectives:[depth],quote:`Synthetic fixture: ${depth}`}]} }],evidence_limits:'Synthetic teaching material, not a real uploaded PDF or verified OCR.'}];
    delete fixture.knowledge;
    result.push({...fixture,name:`${domain}_${rating??'unknown'}_repeat${repeat}`,domain,repeat,rating,
      expected:'Adjust task scope/method for self-reported understanding within unchanged course requirements and capacity; no mandatory monotonic minutes, no invented scores or exams.'});
  }
  return result;
}
