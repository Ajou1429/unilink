import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, createClient } from '../scripts/simulation/runtime.mjs';

test('stale coaching writes return HTTP 409 metadata without weakening SQL guards or atomicity', async () => {
  const { db } = await createDatabase();
  const user = '00000000-0000-4000-8000-000000009801';
  const goal = '00000000-0000-4000-8000-000000009802';
  const subject = '00000000-0000-4000-8000-000000009803';
  const problem = '00000000-0000-4000-8000-000000009804';
  try {
    await db.query('insert into auth.users(id) values($1)', [user]);
    await db.query("insert into learning_goals(id,user_id,title,goal_type) values($1,$2,'Test','personal')", [goal,user]);
    await db.query("insert into problem_bank_subjects(id,user_id,name) values($1,$2,'Test')", [subject,user]);
    await db.query("insert into problem_bank_problems(id,user_id,subject_id,label,level) values($1,$2,$3,'1',2)", [problem,user,subject]);
    const owner = createClient(db, { userId: user });
    const changes = { p_changes: [{ id:problem, level:5, expected:'2000-01-01T00:00:00Z' }] };
    assert.equal((await owner.rpc('set_chat_problem_levels',changes)).error.code,'40001');
    await db.query("select set_config('request.method','POST',false)");
    const error = (await owner.rpc('set_chat_problem_levels',changes)).error;
    assert.equal(error.code,'PGRST');
    assert.equal(JSON.parse(error.message).code,'40001');
    await assert.rejects(db.query("select set_config('request.jwt.claim.sub',$1,true), public.set_chat_problem_levels($2)",[user,changes.p_changes]), error => {
      assert.equal(error.code,'PGRST');
      assert.deepEqual(JSON.parse(error.detail),{ status:409, headers:{} });
      return true;
    });
    assert.equal((await db.query('select level from problem_bank_problems where id=$1',[problem])).rows[0].level,2);
    const rows = (await db.query(`select proname,prosrc from pg_proc where proname in
      ('approve_coaching_proposal','set_chat_problem_levels','postpone_coaching_plan_item')`)).rows;
    assert.equal(rows.length,3);
    assert.ok(rows.every(row=>row.prosrc.includes('UNILINK_HTTP_CONFLICT_V1')));
  } finally { await db.close(); }
});
