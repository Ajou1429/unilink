import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function dashboard({ user = 'owner', query = async () => ({ data: [], error: null }) } = {}) {
  const states = [], effects = [], calls = [];
  let cursor = 0, version = 0, cleanup;
  const jsx = (type, props) => ({ type, props });
  const db = {
    auth: { getUser() { throw new Error('Unexpected duplicate authentication request'); } },
    from(table) {
      const chain = new Proxy({}, { get(_, method) {
        if (method === 'then') return (resolve, reject) => query().then(resolve, reject);
        return (...args) => { calls.push({ table, method, args }); return chain; };
      } });
      return chain;
    },
  };
  const compiled = { exports: {} };
  const require = name => {
    if (name === 'react') return {
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
      },
      useEffect(effect) { effects.push(effect); },
    };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name.endsWith('/supabase-client')) return { getSupabaseBrowserClient: () => db };
    if (name.endsWith('/private-storage')) return {
      getStorageUser: () => user,
      captureStorageScope: () => { const captured = version; return () => { if (captured !== version) throw new Error('Account changed'); }; },
    };
    if (name.endsWith('/p0-sync')) return { flushP0Changes: async () => {} };
    return new Proxy({}, { get: (_, key) => key });
  };
  const source = readFileSync(new URL('../src/components/dashboard/TodayPlans.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, require, Date, Intl, setTimeout });
  return {
    calls,
    render() { cursor = 0; effects.length = 0; return compiled.exports.TodayPlans({ date: '2026-11-17', plans: [], courses: [] }); },
    load() { cleanup?.(); cleanup = effects[0](); },
    switchAccount(next) { user = next; version++; },
  };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function buttons(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.props?.children === '계획 다시 불러오기' ? [node] : []), ...buttons(node.props?.children)];
}

test('today plans reuse the verified account and provide retry after a failed fetch', async () => {
  let fail = true;
  const view = dashboard({ query: async () => { if (fail) throw new TypeError('Failed to fetch'); return { data: [], error: null }; } });
  view.render(); view.load(); await settle();
  const retry = buttons(view.render());
  assert.equal(retry.length, 1);
  assert.ok(view.calls.some(call => call.method === 'eq' && call.args[0] === 'user_id' && call.args[1] === 'owner'));
  fail = false; retry[0].props.onClick(); view.render(); view.load(); await settle();
  assert.equal(buttons(view.render()).length, 0);
});

test('signed-out dashboards skip remote plans and canceled loads cannot publish old account rows', async () => {
  const guest = dashboard({ user: null }); guest.render(); guest.load(); await settle();
  assert.equal(guest.calls.length, 0);
  let finish;
  const pending = dashboard({ query: () => new Promise(resolve => { finish = resolve; }) });
  pending.render(); pending.load(); await settle();
  pending.switchAccount('other'); pending.render(); pending.load();
  finish({ data: [{ id: 'old', title: '이전 계정 계획', metadata: null, planned_minutes: 30, scheduled_start: null }], error: null }); await settle();
  const tree = pending.render();
  assert.equal(buttons(tree).length, 0);
  assert.ok(!JSON.stringify(tree).includes('이전 계정 계획'));
});
