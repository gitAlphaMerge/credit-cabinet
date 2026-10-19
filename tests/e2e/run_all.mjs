#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`Usage: node tests/e2e/run_all.mjs [--main <url>] [--tolya <url>]
Defaults: --main http://127.0.0.1 --tolya http://127.0.0.1:4173
Node 24; stdlib only. Runs main_site, tolya_site, agent_live sequentially.
Tolya site must use EGR_PROVIDER=mock and a live TEAM_AGENT_URL/LLM.
Creates synthetic users and demo data; leaves them on server.
Prints OK/FAIL/WARN per suite; FAIL exits 1. WARN alone exits 0.
Writes tests/e2e/REPORT.md with date, URLs, totals and sanitized failures.
HTTP checks do not execute browser JavaScript. --help uses no network and writes no report.`);
  process.exit(0);
}
const options = { '--main': 'http://127.0.0.1', '--tolya': 'http://127.0.0.1:4173' };
for (let i = 0; i < args.length; i += 2) {
  if (!(args[i] in options) || !args[i + 1] || args[i + 1].startsWith('--')) {
    console.error('Invalid arguments. Use --help.'); process.exit(2);
  }
  options[args[i]] = args[i + 1];
}
for (const [key, value] of Object.entries(options)) {
  let url;
  try { url = new URL(value); } catch { console.error(`Invalid URL for ${key}`); process.exit(2); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    console.error(`Expected HTTP(S) URL without credentials, query or fragment for ${key}`); process.exit(2);
  }
  options[key] = url.href;
}
function redact(value) {
  return String(value)
    .replace(/\b(?:Bearer\s+)[^\s"<>]+/gi, 'Bearer [REDACTED]')
    .replace(/("?(?:password|cookie|set-cookie|alfa_session|token|access_token|refresh_token|authorization)"?\s*[:=]\s*)("[^"\r\n]*"|[^\s;,}]+)/gi, '$1[REDACTED]')
    .replace(/e2e-(?:Live-)?Synthetic-24!|Wrong-password/g, '[REDACTED]');
}
const suites = [];
async function run(name, base) {
  console.log(`RUN ${name} ${base}`);
  let packet, stderr = '', pending = '', launchError = '';
  const child = spawn(process.execPath, [fileURLToPath(new URL(name + '.mjs', import.meta.url)), '--base', base], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  function line(text) {
    if (text.startsWith('E2E_RESULT ')) {
      try { packet = JSON.parse(text.slice('E2E_RESULT '.length)); } catch { /* Missing/invalid packet becomes FAIL below. */ }
    } else if (/^(OK|FAIL|WARN) /.test(text)) {
      // Only fixed step names are forwarded: response bodies and credentials stay out of the console.
      console.log(`[${name}] ${text.split(':')[0]}`);
    } else if (/^TIME .+: \d+ ms$/.test(text)) console.log(`[${name}] ${text}`);
  }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    pending += chunk;
    const lines = pending.split(/\r?\n/); pending = lines.pop();
    for (const entry of lines) line(entry);
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-20000); });
  const code = await new Promise(resolve => {
    child.on('error', error => { launchError = error.message; resolve(null); });
    child.on('close', resolve);
  });
  if (pending) line(pending);
  const valid = Array.isArray(packet?.results) && packet.results.length > 0 && packet.results.every(r => ['OK', 'FAIL', 'WARN'].includes(r.status) && typeof r.step === 'string');
  const results = valid ? packet.results.map(r => ({
    status: r.status, step: redact(r.step), detail: redact(r.detail || '').slice(0, 300), response: redact(r.response || '').slice(0, 300),
  })) : [];
  if (!valid || (code !== 0 && !results.some(r => r.status === 'FAIL'))) results.push({
    status: 'FAIL', step: 'suite process', detail: redact(launchError || `exit=${code}; ${valid ? 'unexpected exit' : 'missing or invalid E2E_RESULT'}`), response: redact(stderr).slice(-300),
  });
  const count = status => results.filter(r => r.status === status).length;
  const status = count('FAIL') ? 'FAIL' : count('WARN') ? 'WARN' : 'OK';
  const suite = { name, base, status, results, ok: count('OK'), fail: count('FAIL'), warn: count('WARN') };
  suites.push(suite);
  console.log(`${status} ${name}: OK=${suite.ok} FAIL=${suite.fail} WARN=${suite.warn}`);
}
// Sequential execution avoids competing agent sessions/LLM requests on the small stand.
const started = new Date().toISOString();
await run('main_site', options['--main']);
await run('tolya_site', options['--tolya']);
await run('agent_live', options['--tolya']);
const md = value => String(value).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;');
const report = [
  '# E2E REPORT', '', `Дата начала (UTC): ${started}`, `Дата окончания (UTC): ${new Date().toISOString()}`,
  `Основной сайт: ${md(options['--main'])}`, `Сайт Толи: ${md(options['--tolya'])}`, '',
  '| Набор | Итог | OK | FAIL | WARN |', '|---|---|---:|---:|---:|',
  ...suites.map(s => `| ${s.name} | ${s.status} | ${s.ok} | ${s.fail} | ${s.warn} |`), '',
  '## FAIL', '', '| Набор | Шаг | Ошибка | Ответ сервера (до 300 символов) |', '|---|---|---|---|',
  ...suites.flatMap(s => s.results.filter(r => r.status === 'FAIL').map(r => `| ${s.name} | ${md(r.step)} | ${md(r.detail)} | ${md(r.response || 'нет ответа сервера')} |`)),
];
if (!suites.some(s => s.fail)) report.push('| — | — | нет | — |');
report.push('', '## WARN', '', ...suites.flatMap(s => s.results.filter(r => r.status === 'WARN').map(r => `- ${s.name}: ${md(r.step)}: ${md(r.detail)}`)));
if (!suites.some(s => s.warn)) report.push('нет');
report.push('', 'HTTP-проверки не исполняют JavaScript браузера. Синтетические учётки и демо-данные остаются на сервере.', 'Cookie и пароли в отчёт не записываются.', '');
await writeFile(new URL('REPORT.md', import.meta.url), report.join('\n'), 'utf8');
const failed = suites.some(s => s.fail);
console.log(`TOTAL ${failed ? 'FAIL' : suites.some(s => s.warn) ? 'WARN' : 'OK'}; report=tests/e2e/REPORT.md`);
process.exitCode = failed ? 1 : 0;
