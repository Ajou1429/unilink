begin;

alter table public.course_knowledge_tasks drop constraint course_knowledge_tasks_check;
alter table public.course_knowledge_tasks add constraint course_knowledge_tasks_page_range_check
  check((kind='research' and note_id is null and page_start is null and page_end is null)
    or (kind in ('index','refresh') and note_id is not null and page_start is null and page_end is null)
    or (kind in ('overview','detail') and note_id is not null and page_start is not null and page_end is not null and page_start>=1 and page_end>=page_start));

commit;
