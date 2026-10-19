#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { extname } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node tests/e2e/main_site.mjs --base http://localhost [--timeout 40000]\nNode 24; stdlib only. Reads HTML/CSV inventory from repository, content from server. No browser JavaScript execution.');
  process.exit(0);
}
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const base = new URL(option('--base', 'http://127.0.0.1'));
const timeout = Number(option('--timeout', '40000'));
if (!/^https?:$/.test(base.protocol) || !Number.isFinite(timeout) || timeout <= 0) throw Error('Invalid base or timeout');
let failed = 0, passed = 0;
const results = [];
let lastResponse = '';
async function step(name, fn) {
  lastResponse = '';
  try { const detail = await fn(); passed++; results.push({ status: 'OK', step: name }); console.log(`OK ${name}: ${detail ?? ''}`); }
  catch (e) { failed++; results.push({ status: 'FAIL', step: name, detail: e.message, response: lastResponse.slice(0, 300) }); console.log(`FAIL ${name}: ${e.message}`); }
}
function check(ok, message) { if (!ok) throw Error(message); }
const root = new URL('../../services/frontend/', import.meta.url);
async function inventory(dir, prefix = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...await inventory(new URL(e.name + '/', dir), prefix + e.name + '/'));
    else out.push(prefix + e.name);
  }
  return out;
}
async function request(path, init = {}) {
  const r = await fetch(new URL(path, base), { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
  const text = await r.text();
  lastResponse = `HTTP ${r.status}: ${text}`;
  return { r, text };
}
const files = await inventory(root), pages = files.filter(p => p.endsWith('.html'));
const seen = new Map(), fragments = [];
function mime(url) {
  const ext = extname(url.pathname).toLowerCase();
  return ({ '.html': /text\/html/i, '.css': /text\/css/i, '.js': /(?:java|ecma)script/i,
    '.svg': /image\/svg\+xml/i, '.png': /image\/png/i, '.jpg': /image\/jpeg/i,
    '.jpeg': /image\/jpeg/i, '.webp': /image\/webp/i, '.ico': /image\/(?:x-icon|vnd.microsoft.icon)/i,
    '.csv': /(?:text\/(?:csv|plain)|application\/(?:csv|octet-stream))/i,
    '.woff2': /(?:font\/woff2|application\/octet-stream)/i, '.json': /application\/json/i })[ext] || (!ext ? /text\/html/i : null);
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
async function resource(url) {
  const key = url.origin + url.pathname + url.search;
  if (seen.has(key)) return seen.get(key);
  const data = await request(key);
  check(data.r.status === 200, `HTTP ${data.r.status} ${key}: ${data.text.slice(0, 180)}`);
  const type = data.r.headers.get('content-type') || '', expected = mime(url);
  check(!expected || expected.test(type), `wrong Content-Type ${type} ${key}`);
  seen.set(key, data);
  return data;
}
for (const page of ['/', ...pages]) {
  const url = new URL(page, base);
  let html;
  await step(`page ${url.pathname}`, async () => { html = (await resource(url)).text; return '200 text/html'; });
  if (!html) continue;
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  if (page === 'v2/podbor.html') await step('B02 podbor application link', () => {
    const links = [...clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m => /оформлен/i.test(m[2]));
    check(links.length > 0, 'application link missing');
    for (const m of links) {
      const href = m[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
      check(href && href !== '#' && !/^javascript:/i.test(href), `invalid application href: ${href}`);
    }
    return 'application link has a destination';
  });
  for (const m of clean.matchAll(/(?<![\w:-])(href|src)\s*=\s*(["'])(.*?)\2/gi)) {
    const raw = decode(m[3]);
    if (!raw || /\$\{|\{\{|^(?:data|javascript|mailto|tel):/i.test(raw)) continue;
    const target = new URL(raw, url);
    if (target.origin !== base.origin) continue;
    if (target.hash.length > 1) fragments.push(target);
    await step(`${page} ${m[1]} ${raw}`, async () => { await resource(target); return '200, MIME checked'; });
  }
  // renderVals creates image paths as JS strings rather than literal src attributes.
  for (const m of clean.matchAll(/["']((?:\.\.\/)?(?:img|demo)\/[^"'\s<>$]+\.(?:svg|png|jpg|webp|csv))["']/g)) {
    await step(`${page} generated asset ${m[1]}`, async () => { await resource(new URL(m[1], url)); return '200, MIME checked'; });
  }
}
for (const target of fragments) await step(`anchor ${target.pathname}${target.hash}`, async () => {
  const { text } = await resource(target), id = decodeURIComponent(target.hash.slice(1));
  const ids = [...text.matchAll(/\b(?:id|name)\s*=\s*(["'])(.*?)\1/g)].map(m => decode(m[2]));
  check(ids.includes(id), `missing id/name ${id}`); return 'exists';
});
// CSS URLs and JS-generated asset strings are also reachable user resources.
for (const file of files.filter(p => /\.(css|js)$/.test(p) && !/petite-vue/.test(p))) {
  let source;
  await step(`asset ${file}`, async () => { source = (await resource(new URL(file, base))).text; return '200, MIME checked'; });
  if (!source) continue;
  for (const m of source.matchAll(/url\(\s*["']?([^\s)'"?]+)["']?\s*\)/g)) {
    if (/^(?:data:|#)/.test(m[1])) continue;
    const u = new URL(m[1], new URL(file, base));
    if (u.origin === base.origin) await step(`CSS ${file} ${m[1]}`, async () => { await resource(u); return '200'; });
  }
}
function payload(csv, file = '') {
  return { statement_csv: csv, need: { purpose: file.includes('equipment') ? 'оборудование' : file.includes('seasonal') ? 'сезон' : 'кассовый разрыв', amount_rub: 900000, term_months: 12, repay_from: 'текущая выручка', asked_for: 'кредит' },
    questionnaire: { form: /seasonal|no_cashflow/.test(file) ? 'ИП' : 'ООО', need: 'кассовый разрыв', sector: 'торговля', years: 'больше 3', trend: 'в плюс' }, confirmed_fields: {}, history: [] };
}
async function score(body, status, contentType = 'application/json') {
  const { r, text } = await request('/api/score', { method: 'POST', headers: { 'Content-Type': contentType }, body });
  check(/application\/json/i.test(r.headers.get('content-type') || ''), `HTTP ${r.status}, non-JSON: ${text.slice(0, 180)}`);
  let json; try { json = JSON.parse(text); } catch { throw Error(`HTTP ${r.status}, invalid JSON: ${text.slice(0, 180)}`); }
  if (status === 'success') { check(r.status === 200 && json?.core && json?.view, `expected decision 200, got ${r.status}: ${text.slice(0, 180)}`); }
  else check(r.status >= 400 && r.status < 500 && typeof json?.error === 'string' && json.error.length > 0, `expected JSON 4xx error, got ${r.status}: ${text.slice(0, 180)}`);
  return `HTTP ${r.status}, JSON`;
}
await step('API health through nginx', async () => {
  const { r, text } = await request('/api/health');
  check(r.status === 200 && /application\/json/i.test(r.headers.get('content-type') || ''), `health HTTP ${r.status}: ${text.slice(0, 180)}`);
  check(JSON.parse(text).status === 'ok', `unhealthy: ${text.slice(0, 180)}`);
  return '200 JSON status=ok';
});
await step('v2 agent POST through nginx', async () => {
  const { r, text } = await request('/agent/turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: `e2e-v2-${crypto.randomUUID()}`, text: 'Нужен миллион на закупку плитки под объект', questionnaire: { form: 'ООО', sector: 'стройка', years: 'больше 3', trend: 'в плюс' } }) });
  check(r.status === 200 && /application\/json/i.test(r.headers.get('content-type') || ''), `HTTP ${r.status}: ${text.slice(0, 180)}`);
  const data = JSON.parse(text);
  check(typeof data.text === 'string' && data.text.trim(), `empty agent text: ${text.slice(0, 180)}`);
  return '200 nonempty text';
});
await step('v2 agent GET through nginx', async () => {
  const { r } = await request('/agent/turn');
  check(r.status === 405, `expected 405, got ${r.status}`); return '405';
});
for (const file of files.filter(p => /^demo\/.*\.csv$/.test(p))) await step(`score ${file}`, async () => {
  const csv = (await resource(new URL(file, base))).text;
  return score(JSON.stringify(payload(csv, file)), 'success');
});
for (const [name, body, ct] of [
  ['empty body', '', 'application/json'], ['not JSON', '{broken', 'application/json'],
  ['wrong Content-Type', JSON.stringify(payload('date,amount\n2026-01-01,1')), 'text/plain'],
  ['6 MiB body', JSON.stringify({ padding: 'x'.repeat(6 * 1024 * 1024) }), 'application/json'],
  ['missing fields', '{}', 'application/json'],
  ['bad CSV', JSON.stringify(payload('date,amount,counterparty,purpose\nNOT-DATE,NOT-MONEY,"unterminated')), 'application/json'],
]) await step(`negative ${name}`, () => score(body, 'error', ct));
console.log(`TOTAL OK=${passed} FAIL=${failed}`);
console.log('E2E_RESULT ' + JSON.stringify({ results }));
process.exitCode = failed ? 1 : 0;
