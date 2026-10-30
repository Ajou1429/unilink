-- 문제은행을 PDF 파일 단위로 묶는다.
-- 같은 과목이라도 파일이 다르면 같은 문항 번호(과제1의 1번, 과제2의 1번)를 따로 기록한다.
-- 문항 번호는 이제 브라우저에서 규칙 기반으로 추출하고, 사용자가 확인한 목록만 저장한다.

update public.problem_bank_problems set source_file = '' where source_file is null;

alter table public.problem_bank_problems
  alter column source_file set default '',
  alter column source_file set not null;

alter table public.problem_bank_problems
  drop constraint if exists problem_bank_problems_subject_id_label_key;

alter table public.problem_bank_problems
  add constraint problem_bank_problems_subject_file_label_key unique (subject_id, source_file, label);

-- 클라이언트 검증은 우회할 수 있으므로 DB에도 길이 상한을 둔다. NOT VALID로 기존 데이터는 보존.
alter table public.problem_bank_problems
  add constraint problem_bank_problems_label_length check (char_length(btrim(label)) between 1 and 100) not valid;

alter table public.problem_bank_problems
  add constraint problem_bank_problems_source_file_length check (char_length(source_file) <= 200) not valid;
