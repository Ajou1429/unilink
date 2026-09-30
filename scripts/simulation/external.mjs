import path from 'node:path';
import * as pdfLib from 'pdf-lib';
import { createClient, moduleLoader, root } from './runtime.mjs';

export async function samplePdf(pages = 2) {
  const doc = await pdfLib.PDFDocument.create();
  doc.setCreationDate(new Date('2026-09-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-09-01T00:00:00Z'));
  for (let page = 0; page < pages; page++) {
    doc.addPage([595, 842]).drawText(`UniLink simulation - page ${page + 1}\n1. Explain normalization.\n  a. First normal form\n  b. Second normal form\n2. Calculate the sample mean.`, { x: 50, y: 740, size: 13, lineHeight: 24 });
  }
  return doc.save();
}

export function createExternalRuntime(db, users, pdf) {
  const state = { expired: new Set(), revoked: new Set(), calls: [], logs: [], geminiMode: 'ok', trees: new Map(), changes: new Map() };
  for (const user of users) {
    const rootId = `root-${user.id}`;
    const tree = new Map([[rootId, { id: rootId, name: 'GoodNotes', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }]]);
    for (let index = 0; index < 12; index++) {
      const id = `folder-${index}-${user.id}`;
      tree.set(id, { id, name: `Course ${index + 1}`, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] });
    }
    const nestedId = `week-${user.id}`;
    tree.set(nestedId, { id: nestedId, name: 'Week 1', mimeType: 'application/vnd.google-apps.folder', parents: [`folder-0-${user.id}`] });
    for (let index = 0; index < 5; index++) {
      const id = `pdf-${index}-${user.id}`;
      tree.set(id, { id, name: `Lecture_${index + 1}.pdf`, mimeType: 'application/pdf', modifiedTime: '2026-09-20T02:00:00Z',
        size: String(pdf.length), parents: [index === 0 ? nestedId : `folder-1-${user.id}`], bytes: pdf });
    }
    state.trees.set(user.id, tree);
    state.changes.set(user.id, []);
  }
  const env = {
    SUPABASE_URL: 'https://simulation.invalid', SUPABASE_SERVICE_ROLE_KEY: 'simulation-service', SUPABASE_ANON_KEY: 'simulation-anon',
    GOOGLE_CLIENT_ID: 'simulation-client', GOOGLE_CLIENT_SECRET: 'simulation-secret', GOOGLE_REDIRECT_URI: 'https://simulation.invalid/google-auth/callback',
    FRONTEND_URL: 'http://localhost:3000', DRIVE_TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
    GOOGLE_DRIVE_WEBHOOK_TOKEN: 'simulation-webhook', GOOGLE_DRIVE_WEBHOOK_URL: 'https://simulation.invalid/drive-webhook', GEMINI_API_KEY: 'simulation-gemini',
  };
  const json = (body, status = 200) => Response.json(body, { status });
  const userFor = (value, prefix) => users.find((user) => value === prefix + user.id);
  async function fetchMock(input, init = {}) {
    const url = new URL(String(input));
    state.calls.push({ host: url.host, path: url.pathname, method: init.method ?? 'GET' });
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token') {
      const body = new URLSearchParams(init.body);
      const authCode = body.get('grant_type') === 'authorization_code';
      const user = userFor(body.get(authCode ? 'code' : 'refresh_token'), authCode ? 'sim-code-' : 'sim-refresh-');
      if (!user || (!authCode && (state.expired.has(user.id) || state.revoked.has(user.id)))) return json({ error: 'invalid_grant' }, 400);
      if (authCode) { state.expired.delete(user.id); state.revoked.delete(user.id); }
      return json({ access_token: `sim-access-${user.id}`, ...(authCode ? { refresh_token: `sim-refresh-${user.id}` } : {}), expires_in: 3600, token_type: 'Bearer' });
    }
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/revoke') {
      const user = userFor(new URLSearchParams(init.body).get('token'), 'sim-refresh-');
      if (user) state.revoked.add(user.id);
      return json({});
    }
    if (url.host === 'generativelanguage.googleapis.com') {
      if (state.geminiMode === 'throttle') return json({ error: 'quota' }, 429);
      return json({ candidates: [{ content: { parts: [{ text: state.geminiMode === 'malformed' ? 'not-json' : JSON.stringify([
        { number: '1', parts: ['a', 'b'] }, { number: '2', parts: [] }, { number: '2', parts: [] },
      ]) }] } }] });
    }
    if (url.host !== 'www.googleapis.com' || !url.pathname.startsWith('/drive/v3/')) throw new Error(`External network is forbidden in simulation: ${url.host}`);
    const user = userFor(new Headers(init.headers).get('Authorization'), 'Bearer sim-access-');
    if (!user) return json({ error: 'invalid_token' }, 401);
    const tree = state.trees.get(user.id);
    const route = url.pathname.slice('/drive/v3'.length);
    if (route === '/about') return json({ user: { emailAddress: user.email, displayName: user.name } });
    if (route === '/channels/stop') return json({});
    if (route === '/changes/startPageToken') return json({ startPageToken: 'cursor-1' });
    if (route === '/changes/watch') return json({ resourceId: `resource-${user.id}`, expiration: String(Date.now() + 86400000) });
    if (route === '/changes') return json({ newStartPageToken: 'cursor-2', changes: state.changes.get(user.id).map((file) => ({ file })) });
    if (route === '/files') {
      const q = url.searchParams.get('q') ?? '';
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const mime = /mimeType = '([^']+)'/.exec(q)?.[1];
      const found = [...tree.values()].filter((file) => file.parents?.includes(parent) && file.mimeType === mime && !file.trashed);
      const start = Number(url.searchParams.get('pageToken') ?? 0), end = start + 2;
      return json({ files: found.slice(start, end).map(({ bytes, ...file }) => { void bytes; return file; }), ...(end < found.length ? { nextPageToken: String(end) } : {}) });
    }
    if (route.startsWith('/files/')) {
      const file = tree.get(decodeURIComponent(route.slice('/files/'.length)));
      if (!file) return json({ error: 'not_found' }, 404);
      if (url.searchParams.get('alt') === 'media') return new Response(file.bytes, { headers: { 'Content-Type': file.mimeType } });
      const { bytes, ...metadata } = file;
      void bytes;
      return json(metadata);
    }
    throw new Error(`Unimplemented simulated Google route: ${route}`);
  }
  const handlers = new Map();
  function handler(name) {
    if (handlers.has(name)) return handlers.get(name);
    let serve;
    const load = moduleLoader({ fetch: fetchMock, Deno: { env: { get: (key) => env[key] }, serve: (fn) => { serve = fn; } },
      console: { ...console, error: (...args) => state.logs.push(args.map((arg) => typeof arg === 'string' ? arg : 'details').join(' ')) } },
    (specifier) => specifier.startsWith('jsr:@supabase/') ? { createClient: (_url, key, options) => {
      const token = options?.global?.headers?.Authorization?.replace(/^Bearer /, '');
      return createClient(db, { admin: key === env.SUPABASE_SERVICE_ROLE_KEY, userId: userFor(token, 'sim-')?.id ?? null });
    } } : specifier.startsWith('npm:pdf-lib') ? pdfLib : undefined);
    const exports = load(path.join(root, 'supabase/functions', name, 'index.ts'));
    const fn = serve ?? exports.handleGoogleAuth;
    if (!fn) throw new Error(`No handler for ${name}`);
    handlers.set(name, fn);
    return fn;
  }
  async function invoke(name, userId, body = {}, options = {}) {
    const [functionName] = name.split('/');
    const headers = new Headers(options.headers);
    if (userId) headers.set('Authorization', `Bearer sim-${userId}`);
    if (!(body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const method = options.method ?? 'POST';
    return handler(functionName)(new Request(`https://simulation.invalid/functions/v1/${name}`, {
      method, headers, ...(method === 'GET' ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    }));
  }
  return { state, env, invoke };
}
