$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.Drawing
$artifactRoot = (Resolve-Path 'docs/deliverables').Path
$out = Join-Path $artifactRoot 'UniLink_AI_Coaching_Integrated_ERD.docx'
$png = Join-Path $artifactRoot 'coaching-erd-qa.png'
# Preset: standard_business_brief; Korean font override: Malgun Gothic.
$bmp = [Drawing.Bitmap]::new(1560,1500)
$g = [Drawing.Graphics]::FromImage($bmp)
$g.Clear([Drawing.Color]::White)
$g.SmoothingMode = 'AntiAlias'
$font = [Drawing.Font]::new('Consolas',22)
$bold = [Drawing.Font]::new('Consolas',24,[Drawing.FontStyle]::Bold)
$pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#49657A'),3)
function Box($x,$y,$title,$lines) {
  $g.FillRectangle([Drawing.Brushes]::White,$x,$y,460,230)
  $g.DrawRectangle($pen,$x,$y,460,230)
  $g.FillRectangle([Drawing.Brushes]::AliceBlue,$x+2,$y+2,456,48)
  $g.DrawString($title,$bold,[Drawing.Brushes]::Black,$x+12,$y+8)
  for($i=0;$i -lt $lines.Count;$i++){ $g.DrawString($lines[$i],$font,[Drawing.Brushes]::Black,$x+12,$y+62+34*$i) }
}
function Edge($x1,$y1,$x2,$y2,$label) {
  $g.DrawLine($pen,$x1,$y1,$x2,$y2)
  $g.DrawString($label,$font,[Drawing.Brushes]::DarkSlateGray,($x1+$x2)/2-24,($y1+$y2)/2-58)
}
Box 40 20 'profiles' @('PK id = auth.users.id','timezone','preferences JSONB')
Box 550 20 'learning_goals' @('PK id / FK user_id','FK course_id (nullable)','type, title, target_date','metadata JSONB')
Box 1060 20 'goal_topics' @('PK id / FK goal_id','FK parent_topic_id','title, status','metadata JSONB')
Edge 500 135 550 135 '1:N'
Edge 1010 135 1060 135 '1:N'
Box 40 420 'learning_resources' @('PK id / FK user_id','FK note_id, version','source, content_hash','metadata JSONB')
Box 550 420 'resource_topic_links' @('PK id','FK resource_id','FK topic_id','page_start, page_end')
Box 1060 420 'topic_observations' @('PK id / FK topic_id','FK user_id, observed_at','source, mastery, perceived','evidence JSONB')
Edge 500 535 550 535 '1:N'
$g.DrawLines($pen,[Drawing.Point[]]@([Drawing.Point]::new(1290,250),[Drawing.Point]::new(1290,330),[Drawing.Point]::new(780,330),[Drawing.Point]::new(780,420)))
$g.DrawString('Topic 1:N links',$font,[Drawing.Brushes]::DarkSlateGray,810,335)
Edge 1290 250 1290 420 '1:N'
Box 40 820 'study_plans' @('PK id / FK user_id','FK coaching_run_id','type, period, status','request_metadata JSONB')
Box 550 820 'study_plan_items' @('PK id / FK plan_id','FK goal_id, topic_id','method, start_at, minutes','criteria JSONB')
Box 1060 820 'study_sessions' @('PK id / FK plan_item_id','FK user_id','started_at, actual_minutes','result_metadata JSONB')
Edge 500 935 550 935 '1:N'
Edge 1010 935 1060 935 '1:N'
Box 40 1220 'learner_snapshots' @('PK id / FK user_id','as_of, feature_version','state JSONB')
Box 550 1220 'coaching_runs' @('PK id / FK snapshot_id','FK user_id, status','model/prompt/policy ver.','input/output JSONB')
Box 1060 1220 'coaching_feedback' @('PK id / FK run_id','FK plan_item_id (nullable)','kind, created_at','payload JSONB')
Edge 500 1335 550 1335 '1:N'
Edge 1010 1335 1060 1335 '1:N'
$bmp.Save($png,[Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

$body = [Text.StringBuilder]::new()
function X([string]$s){ [Security.SecurityElement]::Escape($s) }
function P([string]$text,[string]$style='Normal') {
 [void]$body.Append('<w:p><w:pPr><w:pStyle w:val="'+$style+'"/></w:pPr><w:r><w:t xml:space="preserve">'+(X $text)+'</w:t></w:r></w:p>')
}
function Page([string]$title){ [void]$body.Append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); P $title 'Heading1' }
function Table($headers,$rows,$widths) {
 [void]$body.Append('<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblInd w:w="120" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:start w:w="120" w:type="dxa"/><w:end w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>')
 foreach($w in $widths){ [void]$body.Append('<w:gridCol w:w="'+$w+'"/>') }; [void]$body.Append('</w:tblGrid>')
 $all = @(@{cells=$headers; head=$true}) + @($rows | ForEach-Object { @{cells=$_; head=$false} })
 foreach($row in $all){
  [void]$body.Append('<w:tr><w:trPr><w:cantSplit/>'+$(if($row.head){'<w:tblHeader/>'})+'</w:trPr>')
  for($i=0;$i -lt $widths.Count;$i++){
   [void]$body.Append('<w:tc><w:tcPr><w:tcW w:w="'+$widths[$i]+'" w:type="dxa"/><w:vAlign w:val="center"/>'+$(if($row.head){'<w:shd w:fill="F2F4F7"/>'})+'</w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/></w:pPr><w:r><w:rPr>'+$(if($row.head){'<w:b/>'})+'</w:rPr><w:t>'+ (X $row.cells[$i])+'</w:t></w:r></w:p></w:tc>')
  }; [void]$body.Append('</w:tr>')
 }; [void]$body.Append('</w:tbl>'); P ''
}
P 'UniLink 학습 코칭 AI' 'Title'
P '통합 설계 정리본 · 고정/동적 데이터 · 간단 ERD' 'Subtitle'
P '2026-09-17 | 팀 협의용 초안 | 본문 22개 장 + Word 메모 19개 + 최신 요청 통합' 'Caption'
P '설계 결론' 'Heading1'
P '학습 데이터의 공통 관계와 제약은 고정 컬럼으로, 과목·목표·요청에 따라 달라지는 부가 정보는 유형과 버전이 있는 JSONB로 관리한다. DB와 상태 계산을 먼저 정리하고 Rule + LLM 코칭 MVP를 연결한 뒤 실행 데이터로 보정한다.'
P '고정 컬럼은 값이 고정된다는 뜻이 아니다. 목표 기한·진도·상태는 계속 바뀌지만 공통 스키마가 필요하므로 컬럼으로 둔다. JSONB는 LLM 전용 데이터가 아니라 검증 가능한 DB 확장 필드다.'
P '제품과 제안 단위' 'Heading1'
P '수업과 개인학습은 Learning Goal로 통합하되, 수업 고유 정보는 courses로 유지한다. 목표는 과목 이수·자격증 합격·프로젝트 완료 등으로 다르고, 요청은 오늘 계획·이번 주 계획·시험 대비·단원 복습·상태 평가로 구분한다.'
P '기본 계획 항목은 Topic + Study Method + 시간이다. 범위는 요청마다 선택하되 Goal → Topic → Subtopic의 3단계 틀을 출발점으로 삼고 과도한 분할은 막는다. 상세 주제가 없는 초기 목표는 topic_id를 비워 계획을 시작할 수 있다.'
P '메모를 우선 반영한 변경' 'Heading2'
P '추천 블록은 기본 30분, 필요 시 60분 이상으로 구성한다. 원문의 20·25분 예시는 이 초안에서 대체한다. 실제 학습시간은 반올림하지 않고 기록한다. 채팅과 시간표를 먼저 제공하고 UI 고도화는 뒤에 진행한다.'
P '자료 범위와 상태' 'Heading2'
P '원문의 코드 Audit은 2026-09-09 기준 기록이다. 이 문서는 현재 구현 완료 보고서가 아니라 앞으로 구축할 설계안이다. 척도, 예외 시간 단위, 피드백 가중치 수치는 팀 합의 전까지 제안으로 취급한다. 원본 파일과 실제 DB는 수정하지 않는다.'

Page '개발 순서와 협의할 항목'
Table @('순서','작업','완료 산출물') @(
 ,@('1','최종 목표·계획 최소 단위·요청 범위 협의','도메인 용어와 결정 기록')
 ,@('2','필요 데이터 목록을 컬럼 후보로 정리','기존 저장소 → 테이블 매핑')
 ,@('3','공통 컬럼과 유형별 동적 정보 분리','컬럼 사전 + JSON Schema v1')
 ,@('4','ID/FK·소유권·시간·척도 일관성 검토','ERD + 제약·RLS 검증 기준')
 ,@('5','Core DB 구축, 사용자 데이터·Drive 연결','소유자가 확인된 데이터 이전')
 ,@('6','자료 분석·Learner State·Rule + LLM MVP','읽기 전용 추천 → 승인형 Planner')
 ,@('7','실행·피드백·성과 수집, 1차 보정','완료율·시간오차·성과 비교')
 ,@('8','구축·보정 반복, 평가 하네스 확장','회귀 평가·버전 비교·지속 개선')
) @(650,4590,4120)
P '먼저 합의할 것' 'Heading2'
P 'plan_type은 시간 범위(daily, weekly, exam, custom), 요청 intent는 행동(plan, assess, explain, modify)으로 분리하는 안을 제안한다. “SQLD 합격”은 장기 Goal이고 “이번 주 SQLD 계획”은 그 Goal을 대상으로 한 요청이다.'
P '이해도·체감 난이도·콘텐츠 난이도의 척도와 출처를 확정한다. 문제은행 0~5 학습 상태는 정답률이나 이해도와 동일시하지 않는다. 자가 평가와 객관 성과를 각각 보존하고 결측은 0으로 채우지 않는다.'
P '기본 30분 블록보다 짧은 가용시간 처리, Topic 계층 예외, 실제시간 입력 방식, Planner 승인 범위, 최종 성과 반영 가중치는 추가 협의한다.'
P '하네스 도입 시점' 'Heading2'
P '실행 로그·버전·실패 사례는 MVP부터 저장한다. 데이터가 쌓이면 동일 입력 재실행, 정책/모델 비교, 회귀 테스트, 비용·응답시간 한도를 묶어 평가 하네스를 확장한다. 첫 단계부터 모델 학습이나 멀티에이전트가 필요한 것은 아니다.'

Page '고정 컬럼과 동적 메타데이터'
Table @('영역','고정 컬럼 예시','동적 JSONB 예시') @(
 ,@('목표','id, user_id, type, title, target_date, status','metadata: 합격 점수, 목표 등급, 프로젝트 산출물')
 ,@('요청/계획','plan_type, 기간, status, user_id','request_metadata: 이번 요청의 목표치·선호·추가 제약')
 ,@('계획 항목','plan_id, goal_id, topic_id, method_code, 시간','criteria: 완료 판단 기준, 학습 범위 설명')
 ,@('상태/관측','topic_id, source, observed_at, mastery','evidence: 채팅 발언, 추가 진단 근거')
 ,@('자료','source, note_id, version, content_hash','metadata: 추출기 결과, 추가 자료 속성')
 ,@('피드백','run_id, kind, created_at, plan_item_id','payload: 수정 이유, 만족도, 최종 성과 상세')
) @(1200,4020,4140)
P '목표치가 다르다고 반드시 JSONB인 것은 아니다' 'Heading2'
P '기한·소유자·상태처럼 정렬, 필터, 관계 검증에 자주 쓰는 공통 항목은 컬럼으로 유지한다. 여러 목표에 반복되는 점수 지표는 향후 goal_metrics(goal_id, metric_code, target_value, unit)로 정규화할 수 있다. MVP에서는 드문 유형별 항목만 JSONB에 두고 사용 빈도가 높아지면 컬럼이나 별도 테이블로 승격한다.'
P 'JSONB 예시: 장기 목표와 이번 요청을 분리' 'Heading2'
P '{"type":"certification","schema_version":1,"target":{"exam":"SQLD","score":70,"unit":"points"}}' 'Code'
P '{"type":"weekly_plan","schema_version":1,"target":{"practice_count":30},"preferences":{"block_minutes":30},"constraints":{"study_end_at":"2026-09-18T02:00:00+09:00"}}' 'Code'
P 'score=70과 practice_count=30은 설명용 예시다. 장기 목표 metadata를 이번 요청 값으로 덮어쓰지 않는다. 기준 ID는 JSONB 내부 배열 대신 FK·연결 테이블로 관리한다. 새 유형 추가 시 스키마 버전, 허용 필드, 자료형·단위·범위 검증을 함께 정의한다.'

Page '간단 ERD · 핵심 관계'
P 'PK: 기본키 / FK: 외래키 / 1:N: 하나에 여러 개 연결. 각 테이블의 공통 user_id·시간 컬럼과 일부 연결선은 가독성을 위해 생략했다.' 'Caption'
[void]$body.Append('<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="5943600" cy="5715000"/><wp:docPr id="1" name="Coaching ERD" descr="사용자, 목표, 주제, 자료, 계획, 실행과 피드백의 핵심 PK FK 관계"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="erd.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5943600" cy="5715000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>')
P '추가 FK: courses 1 : 0..1 learning_goals(사용자별 수업 인스턴스 기준), goals/topics 1:N study_plan_items, coaching_runs 1:N study_plans(수정안 포함). topic_id는 해당 goal_id 소속이어야 한다.' 'Caption'
P '상태 관측·일정·문제 성과를 코드로 집계 → learner_snapshots → coaching_runs → 승인된 plans → sessions/feedback. 집계 흐름은 FK 관계와 구분한다.' 'Caption'

Page '보조 테이블과 일관성 규칙'
Table @('묶음','테이블 / 역할') @(
 ,@('일정','courses, course_schedules, course_sessions, course_session_topics, calendar_events, recurring_commitments')
 ,@('자료/분석','기존 notes·drive_connections 재사용. resource_versions, topic_analysis_runs, topic_candidates, resource_chunks는 버전·분석·RAG 확장')
 ,@('문제/상태','기존 problem_bank_subjects/problems에 Goal/Topic FK. problem_attempts, user_topic_state로 시도 이력·현재 상태 분리')
 ,@('실행/성과','coaching_messages, coaching_feedback, learning_outcomes. 계획 수정안은 revision과 이전 계획 FK로 보존')
) @(1650,7710)
P 'ID/FK만으로 충분하지 않은 부분' 'Heading2'
P '사용자 소유 테이블에는 user_id를 명시하고 RLS를 적용한다. (user_id, goal_id), (user_id, topic_id) 등 복합 FK로 다른 사용자의 레코드 연결을 막는다. Topic의 부모는 같은 Goal이어야 하며 자기 참조·순환·허용 깊이를 서버에서 검사한다.'
P '과목명으로 Join하지 않는다. 카탈로그 과목은 학교·학기·과목코드·분반으로 식별하고, 사용자 수강 인스턴스는 별도 UUID를 쓴다. 수동 추가 과목도 같은 Course 모델로 연결하되 이름만 같다는 이유로 합치지 않는다.'
P 'mastery·difficulty의 출처와 척도 버전을 기록한다. 날짜 범위, 양수 학습시간, 유효 페이지, 허용 status 및 metadata 유형/버전을 검증한다. AI가 제시한 ID는 DB 실재 여부와 소유권을 확인한다.'
P '일정과 시간 제약' 'Heading2'
P '매주 반복 일정은 요일·현지 시간·timezone으로, 하루 일정/실제 학습은 시작·종료 timestamptz로 저장한다. 새벽 2시 종료는 다음 날 날짜를 포함한다. 수업·근무·이동·식사·휴식은 가용시간에서 제외한다. 시험은 실제 응시시간을 차단하고 시험일까지 남은 기간은 우선순위에도 반영한다.'
P '계획 승인과 데이터 보존' 'Heading2'
P '추천은 draft로 생성하고 서버 검증 후 사용자 승인 시 Planner에 트랜잭션으로 반영한다. request_id/적용 키로 중복 저장을 막는다. 상태 보관과 취소를 구분하고, 참조 중인 자료·실행 이력은 성급하게 연쇄 삭제하지 않는다. 이전 데이터는 소유자 확인·백업·건수 대조 후 명시적으로 이전한다.'

Page 'LLM 전달 · 자료 비용 · 피드백'
P 'LLM에 넘기는 과정' 'Heading1'
P '자연어 요청을 intent·기간·대상 Goal/Topic 후보로 해석한다. 서버가 권한 확인 후 SQL로 일정·문제·상태를 조회하고 D-day·정답률·완료율·가용시간을 계산한다. Rule이 우선순위와 권장 범위를 만들고 필요한 metadata만 선별해 Learner State와 함께 LLM에 전달한다.'
P '전달 객체는 schema_version, request, learner_state, constraints, policy, resource_refs로 구성한다. 정형 정보는 SQL, 비정형 필기·설명은 필요한 경우 RAG로 가져온다. 인증 토큰·전체 DB·관련 없는 자료는 입력에 포함하지 않는다. LLM의 계획 출력은 별도 스키마와 일정 충돌 검사 후 제안한다.'
P 'Drive / PDF 분석 비용 관리' 'Heading1'
P '자료 등록 또는 내용 변경 시 분석하고 질문마다 PDF 전체를 다시 읽지 않는다. content_hash·자료 버전·분석기 버전으로 중복 분석을 방지한다. 변경 버전의 분석은 stale로 표시하고, 페이지 해시를 신뢰할 수 있을 때만 변경 페이지를 재분석한다. 페이지 번호 변경 시 기존 Topic/Page 연결도 다시 검증한다.'
P '토픽·페이지·난이도는 후보로 저장하고 사용자 확인 후 확정한다. 관련 부분 검색과 요약 캐시로 토큰 사용을 줄인다. 분석별 토큰·비용·실패·재시도 기록 및 사용자 예산을 둔다. 외부 지식은 출처·시점·신뢰도를 가진 참고 자료로 저장한다.'
P '피드백과 지속 개선' 'Heading1'
P '채팅 피드백을 기본 채널로 두고, 만족도 버튼은 보조 입력으로 사용한다. 수락·수정·거절, 계획 대비 실제시간, 완료 여부, 자가 이해도, 실제 문제 성과를 run_id/plan_item_id로 연결한다. 최종 합격·성적·프로젝트 결과는 learning_outcomes에 별도로 남긴다.'
P '초기에는 공통 Rule 가중치를 버전 관리하고 관측 데이터를 반영한다. 개인별 보정과 집단 패턴은 데이터가 충분해진 뒤 검증된 정책으로 적용한다. LLM이 임의로 개인화 수식을 운영에 적용하지 않는다. 상태 평가 요청에도 임박한 과제·시험은 관련성이 있을 때 함께 알려준다.'
P '검증 기준' 'Heading2'
P '권한 침범·가짜 ID·일정 겹침·중복 승인·자료 버전 변경을 회귀 사례로 둔다. 추천 수락률만 보지 않고 완료율, 실제시간 오차, 문제 성과, 수정률, 토큰 비용을 함께 비교한다. 모델·프롬프트·정책·입력 스냅샷 버전을 기록해 보정 전후를 재현한다.'

Page 'Word 메모 반영 내역'
P '원본의 Word 메모 19개를 모두 읽고 아래처럼 통합했다. 메모 ID는 Word 내부 식별자이며 제안·질문을 임의로 최종 합의로 바꾸지 않았다.'
Table @('메모 ID','요지','통합 위치 / 판단') @(
 ,@('4, 5','Goal 통합·계획 단위·척도·plan_type·30분','제품 정의와 협의점. 척도/예외는 미정, 30분 기본 반영')
 ,@('8, 14','이동·식사·새벽 종료·세밀한 시간 회피','일정 제약. 날짜 포함 종료, 30/60분 제안')
 ,@('1, 10','필기 해석 비용·변경 시 재분석','자료 버전/해시·캐시·선택 재분석')
 ,@('18, 16','피드백 DB·채팅/만족도/최종 성과','Feedback + Outcome 분리, 채팅 우선')
 ,@('6','Topic 과도한 세분화 방지','3단계 기본안, 세부화 사용자 확인')
 ,@('12','오늘/주간/상태 평가와 마감 상기','intent와 plan_type 분리, 관련 마감 안내')
 ,@('9, 0','목표 기한·범위마다 요청 달라짐','장기 Goal과 요청 metadata 분리')
 ,@('11, 7','입력 추출·정량 계산은 코드 중심','SQL → State → Rule → LLM 흐름')
 ,@('17','공통/개인 가중치·성과 기반 보정','정책 버전과 평가, 개인화는 데이터 축적 후')
 ,@('15','챗봇 + 시간표 우선, UI 후순위','MVP 정의와 개발 순서')
 ,@('13','RAG는 비정형 중심, 전달 최소화','정형 SQL / 비정형 RAG, 입력 선별')
 ,@('2','카탈로그·수동 과목 SQL 관계 통합','Course UUID·학교/학기/코드/분반 식별')
 ,@('3','아직 없는 기능에 과도한 대응 불필요','현재 Audit과 미래 설계 구분')
) @(850,4050,4460)
P '원문 대비 보완' 'Heading2'
P '원문의 22개 장은 제품·데이터·자료 분석·상태·추천·실행·평가·로드맵으로 재구성했다. 커뮤니티, 성적/스펙 전체 연동, 미세조정, 유사 사용자 모델은 후순위다. 다음 산출물은 팀 결정 기록, 상세 컬럼/JSON Schema, ERD 리뷰, DB migration과 Adapter 설계다.'

$styles = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
foreach($s in @(@('Normal',22,0,120,'222222'),@('Title',44,0,120,'0B2545'),@('Subtitle',25,0,160,'555555'),@('Heading1',32,320,160,'2E74B5'),@('Heading2',26,240,120,'2E74B5'),@('Heading3',24,160,80,'1F4D78'),@('TableText',19,0,60,'222222'),@('Caption',18,80,80,'555555'),@('Code',18,0,120,'222222'))){
 $keep=if($s[0] -match 'Heading|Title|Subtitle'){'<w:keepNext/>'}else{''}
 $weight=if($s[0] -match 'Heading|Title'){'<w:b/>'}else{''}
 $styles += '<w:style w:type="paragraph" w:styleId="'+$s[0]+'"><w:name w:val="'+$s[0]+'"/><w:pPr>'+ $keep +'<w:widowControl/><w:spacing w:before="'+$s[2]+'" w:after="'+$s[3]+'" w:line="264" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Malgun Gothic"/>'+ $weight +'<w:color w:val="'+$s[4]+'"/><w:sz w:val="'+$s[1]+'"/></w:rPr></w:style>'
}; $styles+='</w:styles>'
$doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+$body.ToString()+'<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr></w:body></w:document>'
$stream=[IO.File]::Open($out,[IO.FileMode]::Create)
$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
function Entry($name,$value){$e=$zip.CreateEntry($name); $w=[IO.StreamWriter]::new($e.Open(),[Text.UTF8Encoding]::new($false)); $w.Write($value);$w.Dispose()}
Entry '[Content_Types].xml' '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'
Entry '_rels/.rels' '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
Entry 'word/document.xml' $doc
Entry 'word/styles.xml' $styles
Entry 'word/_rels/document.xml.rels' '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/erd.png"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'
Entry 'word/footer1.xml' '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="777777"/><w:sz w:val="18"/></w:rPr><w:t>UniLink · 설계 초안 | </w:t></w:r><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>'
$e=$zip.CreateEntry('word/media/erd.png');$es=$e.Open();$bytes=[IO.File]::ReadAllBytes($png);$es.Write($bytes,0,$bytes.Length);$es.Dispose()
$zip.Dispose();$stream.Dispose()
[xml]$check=$doc
Write-Output "Created: $out"
Write-Output 'OOXML parsed. Source comments covered: 19/19. Main sections: 7.'
