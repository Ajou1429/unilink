import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { runSimulation } from './simulation/scenarios.mjs';
import { root } from './simulation/runtime.mjs';

const base = path.join(root, '.simulation');
const args = process.argv.slice(2);

async function inspect() {
  const latest = JSON.parse(await readFile(path.join(base, 'latest.json'), 'utf8'));
  if (!/^run-[a-z0-9-]+$/.test(latest.run)) throw new Error('Invalid local simulation path');
  const directory = path.join(base, latest.run);
  await access(path.join(directory, 'db', 'PG_VERSION'));
  const db = new PGlite(path.join(directory, 'db'));
  try {
    await db.exec('begin read only');
    const result = await db.query(`select u.email, count(distinct c.id)::int as courses,
      count(distinct s.id)::int as class_sessions, count(distinct p.id)::int as problems
      from auth.users u left join public.courses c on c.user_id=u.id
      left join public.course_sessions s on s.user_id=u.id
      left join public.problem_bank_problems p on p.user_id=u.id
      group by u.email order by u.email`);
    console.table(result.rows);
    console.table((await db.query('select status,count(*)::int as scenarios from simulation.results group by status')).rows);
    await db.exec('commit');
    console.log(`Local-only database: ${directory}`);
  } finally { await db.close(); }
}

async function main() {
  if (args.includes('--inspect')) {
    if (args.length !== 1) throw new Error('Usage: npm run simulate:inspect');
    return inspect();
  }
  const options = { seed: randomInt(1, 2147483647), users: 12 };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2);
    if (!['seed', 'users'].includes(key) || !/^\d+$/.test(args[i + 1] ?? '')) throw new Error('Usage: npm run simulate:db -- --seed 20260929 --users 12');
    options[key] = Number(args[i + 1]);
  }
  if (!Number.isSafeInteger(options.seed) || options.seed < 1 || options.seed > 2147483647 || options.users < 2 || options.users > 50) throw new Error('Seed: 1..2147483647, users: 2..50');
  const run = `run-${options.seed}-${Date.now()}`;
  const directory = path.join(base, run);
  await mkdir(path.join(directory, 'files'), { recursive: true });
  console.log(`Isolated local PostgreSQL simulation. No live Supabase/Google/Gemini requests. Seed: ${options.seed}`);
  const { report, pdf, files } = await runSimulation({ ...options, directory: path.join(directory, 'db'),
    onProgress: ({ status, name, details }) => console.log(`[${status}] ${name}${details?.error ? '\n' + details.error : ''}`) });
  const artifacts = [];
  for (const [objectPath, bytes] of files) {
    const filename = `files/${artifacts.length + 1}.pdf`;
    await writeFile(path.join(directory, filename), bytes);
    artifacts.push({ objectPath, filename });
  }
  await writeFile(path.join(directory, 'sample-lecture.pdf'), pdf);
  await writeFile(path.join(directory, 'files.json'), JSON.stringify(artifacts, null, 2));
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(directory, 'users.json'), JSON.stringify(report.users, null, 2));
  const summary = ['# UniLink Local Simulation', '', `Seed: ${report.seed}; fictional users: ${report.userCount}.`,
    `Passed: ${report.passed}; failed: ${report.failed}.`, '', '## Scope', report.externalServices, '',
    '## Rows', '| Table | Count |', '| --- | ---: |', ...Object.entries(report.counts).map(([table, count]) => `| ${table} | ${count} |`), '',
    '## Scenarios', ...report.scenarios.map((scenario) => `- ${scenario.status.toUpperCase()} [${scenario.mode}] ${scenario.name}${scenario.details.error ? ': ' + scenario.details.error : ''}`), '',
    '## Not Verified / Not Implemented', ...report.productionGaps.map((gap) => `- ${gap}`), '',
    'These accounts have synthetic sessions, not real Supabase passwords. The DB is NOT connected to the website.',
    'Do not import this fixture into a production project. See docs/database/simulation.md.', ''].join('\n');
  await writeFile(path.join(directory, 'report.md'), summary);
  await writeFile(path.join(base, 'latest.json'), JSON.stringify({ run, seed: report.seed, failed: report.failed }, null, 2));
  console.log(`Report: ${path.join(directory, 'report.md')}`);
  console.log(`Database: ${path.join(directory, 'db')}`);
  if (report.failed) process.exitCode = 1;
}

await main().catch((error) => { console.error(error.message); process.exitCode = 1; });
