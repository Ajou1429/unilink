import type { DemoResult } from '../../supabase/functions/_shared/demoChat';
export type DemoQuota = { remaining: number; day: string };
export async function demoChat(body: unknown): Promise<{ result?: DemoResult; quota: DemoQuota }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('데모 AI 연결 설정이 필요합니다.');
  const response = await fetch(`${url}/functions/v1/demo-chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '데모 대화를 처리하지 못했습니다.');
  return data;
}
