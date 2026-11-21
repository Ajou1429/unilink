import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { validateDemoResult } from '../supabase/functions/_shared/demoChat.ts';
const base = {reply:'도와드릴게요.',action:'reply',title:'',details:[],date:'',time:'',minutes:0,target:'',plans:[]};
test('demo rejects invalid actions, dates, durations and arbitrary destinations', () => {
  assert.equal(validateDemoResult(base).action,'reply');
  for (const patch of [{action:'delete_account'},{action:'navigate',target:'/settings?token=secret'},{action:'event',title:'시험',date:'2026-02-30',time:'09:00'},{action:'plan',plans:[]},{action:'plan',plans:[{title:'복습',course:'운영체제',date:'2026-11-21',time:'23:00',minutes:90,description:'개념'}]}]) assert.throws(()=>validateDemoResult({...base,...patch}));
  assert.equal(validateDemoResult({...base,action:'event',title:'과제',date:'2026-11-21',time:'23:59'}).time,'23:59');
});
test('server quota blocks fourth plan, preserves chat, and denies browser roles', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(readFileSync(new URL('../supabase/migrations/0046_public_demo_quota.sql',import.meta.url),'utf8'));
    const visitor='a'.repeat(64);
    const reserve=async kind=>(await db.query('select public.reserve_demo_usage($1,$2) as result',[visitor,kind])).rows[0].result;
    assert.equal((await reserve('status')).remaining,3);
    assert.deepEqual((await Promise.all(Array.from({length:4},()=>reserve('plan')))).map(x=>x.allowed),[true,true,true,false]);
    assert.equal((await reserve('status')).remaining,0);
    assert.equal((await reserve('chat')).allowed,true);
    await db.exec("update demo_ai_usage set day=day-1;");
    assert.equal((await reserve('status')).remaining,3);
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>reserve('plan'),/permission denied/);
      await assert.rejects(()=>db.query('select * from demo_ai_usage'),/permission denied/);
      await db.exec('reset role');
    }
    await assert.rejects(()=>reserve('invalid'),/Invalid demo/);
  } finally { await db.close(); }
});
