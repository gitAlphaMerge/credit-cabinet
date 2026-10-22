#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node tests/e2e/tolya_site.mjs --base http://127.0.0.1:4180 [--timeout 70000]\nNode 24, stdlib only. Requires EGR_PROVIDER=mock. Creates two synthetic e2e users and saved demo data. No real bank application. Chat requires a working agent; demo/offline replies FAIL. Fixtures read from repository. HTTP checks do not execute SPA JavaScript.');
  process.exit(0);
}
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
const base = new URL(option('--base', 'http://127.0.0.1:4180'));
const timeout = Number(option('--timeout', '70000'));
if (!/^https?:$/.test(base.protocol) || !Number.isFinite(timeout) || timeout <= 0) throw Error('Invalid base or timeout');
let failed = 0, passed = 0;
const results = [];
let lastResponse = '';
const secrets = new Set(['e2e-Synthetic-24!', 'Wrong-password']);
function redact(value) {
  let text = String(value);
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[REDACTED]');
  return text.replace(/("?(?:password|cookie|set-cookie|alfa_session|token)"?\s*[:=]\s*)("[^"\r\n]*"|[^\s;,}]+)/gi, '$1[REDACTED]');
}
function check(ok, text) { if (!ok) throw Error(text); }
async function step(name, fn) {
  lastResponse = '';
  try { const result = await fn(); passed++; results.push({ status: 'OK', step: name }); console.log(`OK ${name}: ${typeof result === 'string' ? result : 'verified'}`); return result; }
  catch (e) { failed++; results.push({ status: 'FAIL', step: name, detail: redact(e.message), response: redact(lastResponse).slice(0, 300) }); console.log(`FAIL ${name}: ${redact(e.message)}`); return undefined; }
}
function client() {
  let cookie = '';
  return { get cookie() { return cookie; }, async call(path, { method = 'GET', body, expected = 200, html = false, binary = false } = {}) {
    const headers = cookie ? { Cookie: cookie } : {};
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const r = await fetch(new URL(path, base), { method, headers, body: body === undefined || body instanceof FormData ? body : JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(timeout) });
    for (const value of r.headers.getSetCookie()) if (value.startsWith('alfa_session=')) { cookie = value.split(';')[0]; secrets.add(cookie); secrets.add(cookie.slice('alfa_session='.length)); }
    const bytes = new Uint8Array(await r.arrayBuffer()), text = new TextDecoder().decode(bytes);
    lastResponse = `HTTP ${r.status}: ${text}`;
    check([expected].flat().includes(r.status), `${method} ${path}: expected ${expected}, HTTP ${r.status}: ${redact(text).slice(0, 220)}`);
    if (html) { check(/text\/html/i.test(r.headers.get('content-type') || ''), `${path}: not HTML`); check(/<div\s+id=["']root["']/.test(text), `${path}: missing SPA root`); return text; }
    if (binary) { check(bytes.length > 0, `${path}: empty download`); return bytes; }
    check(/application\/json/i.test(r.headers.get('content-type') || ''), `${path}: non-JSON ${redact(text).slice(0, 120)}`);
    let data; try { data = JSON.parse(text); } catch { throw Error(`${path}: invalid JSON`); }
    if (r.status >= 400) check(typeof data?.error === 'string' && data.error.length > 0, `${path}: missing error`);
    return data;
  } };
}
const a = client(), b = client(), guest = client();
const phone = () => '79' + String(randomInt(0, 1e9)).padStart(9, '0');
const primaryPhone = phone();
let otherPhone = phone(); while (otherPhone === primaryPhone) otherPhone = phone();
const password = 'e2e-Synthetic-24!';
secrets.add(primaryPhone); secrets.add(otherPhone); secrets.add(password);
const profile = { name: 'e2e synthetic ' + Date.now(), form: 'ООО', stage: 'operating', sector: 'Производство', registered: true, ageBand: '3–5 лет', result: 'Прибыль', debt: 'Нет', intent: 'Подбор финансирования' };
for (const route of ['/', '/demo', '/login', '/onboarding', '/cabinet', '/cabinet-v2', '/efficiency', '/profile', '/chat', '/financing']) await step(`SPA ${route}`, async () => { await guest.call(route, { html: true }); return '200 HTML shell (render not checked)'; });
await step('public config', () => guest.call('/api/config'));
await step('health', () => guest.call('/api/health'));
for (const kind of ['ooo', 'ip', 'idea']) {
  await step(`public demo ${kind}`, () => guest.call('/api/public-demo?kind=' + kind));
  await step(`public calculation ${kind}`, () => guest.call('/api/public-demo/calculate', { method: 'POST', body: { kind, amount: 500000, term: 12 } }));
}
await step('register short password', () => guest.call('/api/auth/register', { method: 'POST', body: { phone: primaryPhone, password: '123', profile }, expected: 422 }));
await step('register bad phone', () => guest.call('/api/auth/register', { method: 'POST', body: { phone: '123', password, profile }, expected: 422 }));
await step('register e2e A', async () => { await a.call('/api/auth/register', { method: 'POST', body: { phone: primaryPhone, password, profile } }); check(a.cookie && !a.cookie.endsWith('='), 'session cookie missing'); });
await step('duplicate phone', () => guest.call('/api/auth/register', { method: 'POST', body: { phone: primaryPhone, password, profile }, expected: 409 }));
await step('register e2e B', () => b.call('/api/auth/register', { method: 'POST', body: { phone: otherPhone, password, profile: { ...profile, name: profile.name + ' B' } } }));
await step('logout invalidates session', async () => {
  const old = a.cookie;
  await a.call('/api/auth/logout', { method: 'POST', body: {} });
  await a.call('/api/state', { expected: 401 });
  const r = await fetch(new URL('/api/state', base), { headers: { Cookie: old }, signal: AbortSignal.timeout(timeout) });
  const data = await r.json(); check(r.status === 401 && data.error, 'old cookie still authorized');
});
await step('login wrong password', () => a.call('/api/auth/login', { method: 'POST', body: { phone: primaryPhone, password: 'Wrong-password' }, expected: 401 }));
await step('login A', () => a.call('/api/auth/login', { method: 'POST', body: { phone: primaryPhone, password } }));
await step('read profile', async () => { const s = await a.call('/api/state'); check(s.profile.name === profile.name, 'wrong profile'); });
await step('edit profile persists', async () => { await a.call('/api/profile', { method: 'PATCH', body: { region: 'e2e region' } }); check((await a.call('/api/state')).profile.region === 'e2e region', 'patch lost'); });
await step('preferences', () => a.call('/api/preferences', { method: 'PATCH', body: { tourDone: true, split: 60 } }));
for (const [label, inn, expected, status] of [['not found', '9900000099', 404], ['liquidated', '9900000002', 200, 'LIQUIDATED'], ['bad INN', 'oops', 422], ['found', '9900000001', 200, 'ACTIVE']]) await step(`lookup ${label}`, async () => {
  const data = await a.call('/api/lookup', { method: 'POST', body: { inn }, expected });
  if (status) check(data.status === status && data.demo === true, `expected mock ${status}`);
});
await step('confirm lookup', async () => { const s = await a.call('/api/lookup/confirm', { method: 'POST', body: { inn: '9900000001' } }); check(s.profile.inn === '9900000001', 'INN not persisted');
  // Preserve e2e marker after registry replaces company name.
  await a.call('/api/profile', { method: 'PATCH', body: { name: profile.name } });
});
const fixtureRoot = new URL('../../hw/tolya/alfa-intellect/fixtures/', import.meta.url);
const categories = { 'statement.csv': 'statement', 'balance.csv': 'balance', 'pnl-comparable.csv': 'pnl', 'pnl.pdf': 'pnl', 'schedule.csv': 'schedule', 'model.xlsx': 'model', 'plan.docx': 'plan' };
const docs = [];
for (const file of (await readdir(fixtureRoot)).filter(f => /\.(csv|pdf|xlsx|docx)$/.test(f))) await step(`upload + confirm ${file}`, async () => {
  const bytes = await readFile(new URL(file, fixtureRoot)), form = new FormData();
  form.append('file', new Blob([bytes]), file);
  if (categories[file]) form.append('category', categories[file]);
  const doc = await a.call('/api/documents', { method: 'POST', body: form });
  check(doc.id && doc.fields && Object.keys(doc.fields).length, 'no extracted fields');
  check(doc.confirmed === false, 'document auto-confirmed');
  const s = await a.call(`/api/documents/${doc.id}/confirm`, { method: 'POST', body: {} });
  check(s.documents.some(d => d.id === doc.id && d.confirmed), 'confirmation lost');
  const downloaded = await a.call(`/api/documents/${doc.id}/download`, { binary: true });
  check(Buffer.from(downloaded).equals(bytes), 'download differs'); docs.push(doc);
  await b.call(`/api/documents/${doc.id}/download`, { expected: 404 });
  return `${doc.id}, ${doc.category}, confirmed, download exact`;
});
await step('B12 team core through site API: annual cash_gap.csv', async () => {
  const statement_csv = await readFile(new URL('../../services/frontend/demo/cash_gap.csv', import.meta.url), 'utf8');
  check(Buffer.byteLength(statement_csv) > 100 * 1024, 'annual fixture must exceed old 100 KiB limit');
  const result = await a.call('/api/team-score', { method: 'POST', body: { statement_csv,
    need: { purpose: 'кассовый разрыв', amount_rub: 900000, term_months: 12, repay_from: 'текущая выручка', asked_for: 'кредит' },
    questionnaire: { form: 'ООО', need: 'кассовый разрыв', sector: 'стройка', years: 'больше 3', trend: 'в плюс' }, confirmed_fields: {} } });
  check(result.core && result.view && result.decision_id, 'no core decision');
  return `200 core/view/decision_id, CSV ${Buffer.byteLength(statement_csv)} bytes`;
});
await step('B12 team-score body above 2 MiB = 413', async () => {
  await a.call('/api/team-score', { method: 'POST', body: { statement_csv: 'x'.repeat(2 * 1024 * 1024 + 1) }, expected: 413 });
  return '413 JSON error';
});
await step('funding context', async () => { const c = await a.call('/api/financing/context'); check(c.data && c.catalog?.length, 'no context/catalog'); });
const input = { purpose: 'Кассовый разрыв', amount: 500000, term: 12, needed: 'month', usage: 'once', description: 'e2e заказчик платит позже расходов', repayFrom: 'оплата заказчика по договору', cycleDays: 30, details: {}, financials: { incoming: 1200000, expenses: 600000, existing: 0, available: 100000, flow: 600000 } };
let selection, second, lead, chat;
await step('create funding v1', async () => { selection = await a.call('/api/selections', { method: 'POST', body: { engine: 'mvp-2', input } }); check(selection.id && selection.version === 1 && selection.versions?.length === 1 && selection.assessment, 'invalid v1'); });
await step('save funding v2', async () => { check(selection, 'v1 unavailable'); second = await a.call('/api/selections', { method: 'POST', body: { engine: 'mvp-2', input: { ...input, amount: 400000 }, parentId: selection.id, expectedVersion: 1 } }); check(second.id === selection.id && second.version === 2 && second.versions?.length === 2 && second.versions[0].calculation.amount === 500000, 'history damaged'); });
await step('stale funding update', async () => { check(selection, 'v1 unavailable'); await a.call('/api/selections', { method: 'POST', body: { engine: 'mvp-2', input, parentId: selection.id, expectedVersion: 1 }, expected: 409 }); });
await step('foreign selection', async () => { check(selection, 'v1 unavailable'); await b.call(`/api/selections/${selection.id}/application-preview`, { expected: 404 }); });
await step('application preview + save + idempotence', async () => {
  check(second, 'v2 unavailable'); const path = `/api/selections/${second.id}`;
  const preview = await a.call(path + '/application-preview'); check(preview.application.version === 2 && preview.application.amount === 400000, 'preview stale');
  await a.call(path + '/application', { method: 'POST', body: { expectedVersion: 1, acknowledgeRisks: true }, expected: 409 });
  if (preview.needsAcknowledgement) await a.call(path + '/application', { method: 'POST', body: { expectedVersion: 2 }, expected: 422 });
  const body = { expectedVersion: 2, acknowledgeRisks: true };
  lead = await a.call(path + '/application', { method: 'POST', body });
  check(lead.id && lead.version === 2 && lead.application.demo === true, 'no demo application');
  check((await a.call(path + '/application', { method: 'POST', body })).id === lead.id, 'duplicate application');
  const s = await a.call('/api/state'); check(s.leads.some(l => l.id === lead.id && l.version === 2), 'application not persisted');
});
await step('dossier', async () => { check(second, 'v2 unavailable'); const d = await a.call(`/api/dossier/${second.id}`); check(d.demo && d.selection.version === 2, 'wrong dossier'); });
await step('cabinet empty + no-credit', async () => { await a.call('/api/cabinet'); await a.call('/api/cabinet/no-credit', { method: 'POST', body: {} }); await a.call('/api/cabinet'); });
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
await step('cabinet add facility', async () => {
  const s = await a.call('/api/cabinet/facility', { method: 'POST', body: { name: 'e2e synthetic loan', amount: 1000000, balance: 1000000, rate: 22, term: 12, firstDate: day(30) } });
  check(s.cabinet?.facility?.events?.length === 12, 'no repayment schedule');
  await a.call('/api/cabinet/no-credit', { method: 'POST', body: {}, expected: 409 });
});
await step('cabinet dated plan', async () => {
  const s = await a.call('/api/cabinet/plan', { method: 'POST', body: { balance: 850000, balanceDate: day(0), through: day(60), source: 'e2e synthetic plan', items: [{ date: day(20), amount: 1200000, label: 'e2e customer payment' }, { date: day(25), amount: -600000, label: 'e2e expenses' }] } });
  check(s.cabinet?.plan?.items?.length === 2, 'plan lost');
});
await step('cabinet coverage', async () => {
  const s = await a.call('/api/cabinet/coverage', { method: 'POST', body: { amount: 600000, start: day(-30), end: day(0), source: 'e2e synthetic CFADS', methodology: 'e2e synthetic available flow after operating expenses and taxes' } });
  check(s.cabinet?.coverage?.amount === 600000, 'coverage lost'); await a.call('/api/cabinet');
});
await step('cabinet discussion snapshot', async () => {
  const result = await a.call('/api/cabinet/discuss', { method: 'POST', body: {} });
  const s = await a.call('/api/state'); check(s.chats.some(c => c.id === result.chatId && c.cabinetContext?.snapshot), 'snapshot missing');
});
await step('legacy demo credit', async () => { const s = await a.call('/api/credit/demo', { method: 'POST', body: {} }); check(s.credit?.demo === true, 'no demo credit'); });
await step('forecast assumptions', () => a.call('/api/forecast-assumptions', { method: 'POST', body: { balance: 850000, incoming: 1200000, expenses: 780000 } }));
for (const stress of [false, true]) await step(`forecast stress=${stress}`, async () => { const f = await a.call('/api/credit/forecast', { method: 'POST', body: { stress } }); check(f.available && Number.isFinite(f.after), 'no forecast'); });
await step('notifications read', () => a.call('/api/notifications/read', { method: 'POST', body: {} }));
await step('new chat', async () => { chat = await a.call('/api/chats', { method: 'POST', body: {} }); check(chat.id && chat.messages.length === 0, 'not a new chat'); });
await step('rename chat', async () => { check(chat, 'chat unavailable'); await a.call(`/api/chats/${chat.id}`, { method: 'PATCH', body: { title: 'e2e cash gap' } }); });
let previous = '';
for (const [i, text] of ['У меня кассовый разрыв: заказчик платит позже, чем нужно оплатить материалы.', 'Нужно 900 тысяч рублей на 12 месяцев.', 'Верну из оплаты заказчика по договору на 1440000 рублей.', 'Выписку загрузил и подтвердил в профиле. Что видно по потоку?', 'А если заказчик задержит оплату?'].entries()) await step(`chat turn ${i + 1}`, async () => {
  check(chat, 'chat unavailable'); const before = await a.call('/api/state'), count = before.chats.find(c => c.id === chat.id)?.messages.length;
  const s = await a.call(`/api/chats/${chat.id}/messages`, { method: 'POST', body: { text } });
  const messages = s.chats.find(c => c.id === chat.id)?.messages;
  check(messages?.length === count + 2 && messages.at(-2).text === text, 'user/assistant turn not persisted');
  const answer = messages.at(-1), reply = answer.text?.trim();
  const problems = [];
  if (answer.role !== 'assistant' || !reply) problems.push('empty/non-assistant reply');
  if (reply && reply === previous) problems.push('verbatim repeat');
  if (/undefined|null|\[object|\u2014/i.test(reply || '')) problems.push('forbidden text/token');
  if (/одобрено/i.test(reply || '')) problems.push('says одобрено');
  if (answer.mode !== 'team-agent') problems.push(`expected team-agent, got ${answer.mode}`);
  previous = reply || '';
  check(!problems.length, `${problems.join(', ')}; reply=${(reply || '').slice(0, 240)}`);
  return `${reply.length} chars, mode=${answer.mode}`;
});
await step('foreign chat PATCH = 404', async () => { check(chat, 'chat unavailable'); await b.call(`/api/chats/${chat.id}`, { method: 'PATCH', body: { title: 'e2e forbidden' }, expected: 404 }); });
await step('foreign chat message = 404', async () => { check(chat, 'chat unavailable'); await b.call(`/api/chats/${chat.id}/messages`, { method: 'POST', body: { text: 'e2e forbidden' }, expected: 404 }); });
// All protected app/funding/cabinet endpoints must authenticate before parsing bodies.
for (const [method, path] of [
  ['GET', '/api/state'], ['PATCH', '/api/profile'], ['PATCH', '/api/preferences'], ['POST', '/api/lookup'], ['POST', '/api/lookup/confirm'],
  ['POST', '/api/documents'], ['POST', '/api/documents/e2e/confirm'], ['GET', '/api/documents/e2e/download'],
  ['GET', '/api/financing/context'], ['POST', '/api/selections'], ['GET', '/api/selections/e2e/application-preview'], ['POST', '/api/selections/e2e/application'],
  ['POST', '/api/chats'], ['PATCH', '/api/chats/e2e'], ['POST', '/api/chats/e2e/messages'], ['POST', '/api/financials'],
  ['POST', '/api/leads'], ['POST', '/api/consultations'], ['GET', '/api/dossier/e2e'], ['POST', '/api/credit/demo'],
  ['POST', '/api/forecast-assumptions'], ['POST', '/api/credit/forecast'], ['POST', '/api/notifications/read'], ['POST', '/api/team-score'],
  ['GET', '/api/cabinet'], ...['payment', 'no-credit', 'facility', 'plan', 'coverage', 'discuss'].map(p => ['POST', '/api/cabinet/' + p]),
]) await step(`guest ${method} ${path}`, () => guest.call(path, { method, ...(method !== 'GET' ? { body: {} } : {}), expected: 401 }));
await step('logout B', () => b.call('/api/auth/logout', { method: 'POST', body: {} }));
await step('logout A', () => a.call('/api/auth/logout', { method: 'POST', body: {} }));
console.log(`TOTAL OK=${passed} FAIL=${failed}; uploaded=${docs.length}; synthetic users retained on server`);
console.log('E2E_RESULT ' + JSON.stringify({ results }));
process.exitCode = failed ? 1 : 0;
