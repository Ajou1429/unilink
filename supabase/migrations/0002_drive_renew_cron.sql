-- Phase 5: Drive push notification channel(최대 7일)이 만료되기 전에
-- drive-renew-channels Edge Function을 하루에 한 번 호출한다.
-- pg_net으로 만든 HTTP 요청은 비동기라 실패해도 pg_cron job 자체는 성공 처리된다.
-- 실패 시 대비책은 roadmap Phase 4의 수동 "Drive 변경 반영" 버튼(drive-sync)이다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- project_url / cron_secret은 배포 후 아래 두 값을 실제 값으로 바꿔 다시 실행하세요.
-- select cron.schedule(...) 은 같은 jobname으로 재실행하면 갱신됩니다.
select
  cron.schedule(
    'drive-renew-channels-daily',
    '0 17 * * *', -- 매일 UTC 17:00 (KST 02:00)
    $$
    select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/drive-renew-channels',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', '<CRON_SECRET 값으로 교체>'
      ),
      body := '{}'::jsonb
    );
    $$
  );
