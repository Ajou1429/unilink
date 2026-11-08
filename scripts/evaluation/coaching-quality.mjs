import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { cases } from './coaching-quality-cases.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const baseline = process.env.COACHING_EVAL_BASELINE ?? 'a354cc3936b8ecea785cd63e1b8f1cb0035bb063';
const model = process.env.COACHING_EVAL_MODEL ?? 'gpt-6.1-sol';
const output = process.env.COACHING_EVAL_OUTPUT;
if (!output) throw new Error('Set COACHING_EVAL_OUTPUT to an output directory outside the repository.');
if (process.argv.includes('--live') && !process.env.OPENAI_API_KEY) throw new Error('Paid replay requires OPENAI_API_KEY in the environment.');
mkdirSync(output, { recursive: true });
const captures = [];

// Run the real baseline/current request builders without credentials or network access.
function loader(variant, capture) {
  const context = vm.createContext({ console, Date, Map, Set, TextEncoder, TextDecoder, URL, Response, Request, Headers,
    AbortSignal, Uint8Array, crypto: globalThis.crypto, Deno: { env: { get: () => 'capture-only' } },
    fetch: async (_url, options) => {
      capture(JSON.parse(options.body));
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text',
        text: JSON.stringify({ summary: 'capture', items: [], deferred_goals: [] }) }] }] });
    } });
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const relative = path.relative(root, filename).replaceAll('\\', '/');
    const source = variant === 'baseline' && relative.startsWith('supabase/functions/_shared/')
      ? execFileSync('git', ['show', `${baseline}:${relative}`], { cwd: root, encoding: 'utf8', windowsHide: true })
      : readFileSync(filename, 'utf8');
    const loaded = { exports: {} }; cache.set(filename, loaded);
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(
      (name) => name.startsWith('.') ? load(path.resolve(path.dirname(filename), name)) : require(name), loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}

for (const fixture of cases()) {
  for (const variant of ['baseline', 'candidate']) {
    let payload;
    const load = loader(variant, value => { payload = value; });
    const context = structuredClone(fixture.context);
    if (fixture.knowledge) {
      const knowledge = load(path.join(root, 'supabase/functions/_shared/courseKnowledge.ts'));
      context.course_knowledge = [{ goal_id: context.goals[0].id,
        ...knowledge.knowledgeContext(structuredClone(fixture.knowledge), [fixture.request.desired_outcome]) }];
    }
    const generator = load(path.join(root, 'supabase/functions/_shared/coaching/model.ts'));
    await generator.generateProposal(fixture.request, context, undefined, model);
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    captures.push({ case: fixture.name, variant, expected: fixture.expected, hash, payload, request: fixture.request, context,
      prompt_version: generator.COACHING_PROMPT_VERSION, input_chars: JSON.stringify(payload).length });
  }
}
writeFileSync(path.join(output, 'requests.json'), JSON.stringify({ baseline, model, captures }, null, 2));
writeFileSync(path.join(output, 'allowlist.json'), JSON.stringify(captures.map(v => v.hash)));
console.log(JSON.stringify({ baseline, model, requests: captures.length, cases: captures.filter(v => v.variant === 'candidate').map(v => v.case),
  input_characters: captures.map(({ case: name, variant, input_chars }) => ({ case: name, variant, input_chars })) }, null, 2));

// Optional local paid replay. Never print or persist the API key. The captured request is unmodified.
if (process.env.OPENAI_API_KEY && process.argv.includes('--live')) {
  const { validateProposal, fitProposalSchedule } = await import('../../supabase/functions/_shared/coaching/contract.ts');
  const results = [];
  for (let index = 0; index < captures.length; index++) {
    // Alternate which variant goes first across cases to reduce order/latency bias.
    const pairStart = index - index % 2;
    const item = captures[pairStart + ((Math.floor(index / 2) % 2) ? 1 - index % 2 : index % 2)];
    const start = Date.now();
    try {
      const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', signal: AbortSignal.timeout(45_000),
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(item.payload) });
      const body = await response.json();
      if (!response.ok || body.status !== 'completed') throw new Error(`Provider status ${response.status}/${body.status ?? 'unknown'}`);
      const text = body.output?.flatMap(v => v.type === 'message' ? v.content.filter(c => c.type === 'output_text').map(c => c.text) : []).join('');
      const proposal = JSON.parse(text);
      let validation = 'pass';
      try { validateProposal(fitProposalSchedule(proposal, item.request, item.context), item.request, item.context); }
      catch (error) { validation = error.message; }
      results.push({ case: item.case, variant: item.variant, proposal, validation, usage: body.usage, milliseconds: Date.now() - start });
    } catch (error) { results.push({ case: item.case, variant: item.variant, error: error.message, milliseconds: Date.now() - start }); }
    writeFileSync(path.join(output, 'results.json'), JSON.stringify({ baseline, model, results }, null, 2));
    console.log(JSON.stringify({ case: item.case, variant: item.variant, status: results.at(-1).error ?? results.at(-1).validation }));
  }
}
