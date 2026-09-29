import test from 'node:test';
import assert from 'node:assert/strict';
import { generateUsers, runSimulation } from '../scripts/simulation/scenarios.mjs';

test('fictional scenario generation is reproducible and varies by seed', () => {
  assert.deepEqual(generateUsers(123, 3), generateUsers(123, 3));
  assert.notDeepEqual(generateUsers(123, 3), generateUsers(124, 3));
});

test('service simulation with real SQL/RLS and mocked external responses', async (t) => {
  const { report } = await runSimulation({ seed: 20260929, users: 3 });
  for (const scenario of report.scenarios) {
    await t.test(scenario.name, () => assert.equal(scenario.status, 'passed', scenario.details.error));
  }
  assert.equal(report.failed, 0);
  assert.equal(report.counts.courses, 14);
  assert.equal(report.counts.study_sessions, 9);
  assert.match(report.externalServices, /simulated/);
  assert.equal(report.excluded.length, 1);
});
