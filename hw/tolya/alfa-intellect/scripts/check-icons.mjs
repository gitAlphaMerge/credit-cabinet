import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../public/icons/', import.meta.url));
const expected = {
  products: ['ALFA_LUMP_UNSEC', 'ALFA_LUMP_SEC', 'ALFA_RCL_UNSEC', 'ALFA_NCL_SEC', 'ALFA_OVERDRAFT', 'ALFA_START', 'ALFA_DELO', 'ALFA_REFI'],
  status: ['queued-sent', 'underwriting-checks', 'info_requested', 'queued-manager', 'underwriting', 'approved', 'offered', 'signed', 'disbursed', 'rejected', 'withdrawn', 'expired'],
  docs: ['statement', 'questionnaire', 'customer-contract', 'reconciliation', 'balance', 'income', 'debt-schedule', 'business-plan'],
  checks: ['egrul', 'fns', 'bankruptcy', 'aml', 'credit-history'],
  empty: ['applications', 'notifications', 'upload', 'network', 'ready'],
};
const palette = new Set(['none', '#171923', '#E3E7ED', '#FFFFFF', '#EF3124']);
const tags = new Set(['svg', 'title', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const attrs = new Set(['xmlns', 'viewBox', 'role', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'points']);

// Parse a deliberately small XML/SVG grammar. Unsupported XML features are
// rejected, rather than delegated to a browser that may repair invalid markup.
function parseSvg(source) {
  const stack = [];
  const nodes = [];
  let cursor = 0;
  for (const token of source.matchAll(/<[^>]*>|[^<]+/g)) {
    if (token.index !== cursor) throw Error('некорректный XML');
    cursor += token[0].length;
    const value = token[0];
    if (!value.startsWith('<')) {
      if (value.trim() && stack.at(-1)?.name !== 'title') throw Error('текст вне title');
      if (/[<&]/.test(value)) throw Error('неподдерживаемый XML-текст');
      if (stack.at(-1)?.name === 'title') stack.at(-1).text += value;
      continue;
    }
    const closing = value.match(/^<\/([a-z]+)\s*>$/);
    if (closing) {
      if (stack.pop()?.name !== closing[1]) throw Error('несогласованные XML-теги');
      continue;
    }
    const opening = value.match(/^<([a-z]+)((?:\s+[\w:-]+\s*=\s*"[^"<>]*")*)\s*(\/?)>$/);
    if (!opening || !tags.has(opening[1])) throw Error('запрещённый или некорректный тег');
    const node = { name: opening[1], attrs: {}, text: '' };
    for (const a of opening[2].matchAll(/([\w:-]+)\s*=\s*"([^"<>]*)"/g)) {
      if (!attrs.has(a[1]) || Object.hasOwn(node.attrs, a[1])) throw Error('запрещённый или повторный атрибут');
      if (a[2].includes('&')) throw Error('XML-сущности не поддерживаются');
      node.attrs[a[1]] = a[2];
    }
    if (!nodes.length ? node.name !== 'svg' : !stack.length || node.name === 'svg') throw Error('нужен единственный корень svg');
    if (stack.at(-1)?.name === 'title') throw Error('вложенный тег в title');
    nodes.push(node);
    if (!opening[3]) stack.push(node);
  }
  if (cursor !== source.length || stack.length || !nodes.length) throw Error('незавершённый XML');
  return nodes;
}

let passed = 0;
const errors = [];
const wanted = Object.entries(expected).flatMap(([group, ids]) => ids.map(id => `${group}/${id}.svg`));
async function walk(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(e => {
    if (e.code === 'ENOENT') return [];
    throw e;
  })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await walk(path.join(dir, entry.name), `${relative}/`));
    else if (entry.isSymbolicLink()) throw Error(`символическая ссылка: ${relative}`);
    else if (entry.name.endsWith('.svg')) result.push(relative);
  }
  return result;
}
for (const extra of (await walk(root)).filter(name => !wanted.includes(name))) errors.push(`${extra}: лишняя иконка`);
for (const name of wanted) {
  try {
    const buffer = await readFile(path.join(root, name));
    if (buffer.length > 2500) throw Error(`размер ${buffer.length} > 2500 байт`);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    const nodes = parseSvg(source);
    const svg = nodes[0].attrs;
    if (svg.xmlns !== 'http://www.w3.org/2000/svg' || svg.viewBox !== '0 0 64 64' || svg.role !== 'img') throw Error('неверные xmlns/viewBox/role');
    if (svg.stroke !== '#171923' || svg['stroke-width'] !== '2.5' || svg['stroke-linecap'] !== 'round' || svg['stroke-linejoin'] !== 'round') throw Error('нарушены константы обводки');
    const titles = nodes.filter(n => n.name === 'title');
    if (titles.length !== 1 || !/^[А-Яа-яЁё0-9\s,()-]+$/.test(titles[0].text.trim()) || !/[А-Яа-яЁё]/.test(titles[0].text)) throw Error('нужно одно русское название');
    let accents = 0;
    let shapes = 0;
    for (const node of nodes) {
      if (!['svg', 'g', 'title'].includes(node.name)) shapes++;
      for (const [key, value] of Object.entries(node.attrs)) {
        if (['fill', 'stroke'].includes(key) && !palette.has(value)) throw Error(`цвет вне палитры: ${value}`);
        if (key === 'fill' && value === '#171923') throw Error('чернила разрешены только для обводки');
        if (key === 'stroke' && value !== '#171923') throw Error('цвет обводки должен быть #171923');
        if (['fill', 'stroke'].includes(key) && value === '#EF3124') {
          if (['svg', 'g', 'title'].includes(node.name)) throw Error('акцент должен быть одной фигурой');
          accents++;
        }
        if (key === 'stroke-width' && value !== '2.5') throw Error('толщина обводки должна быть 2.5');
        if (key === 'stroke-linecap' && value !== 'round' || key === 'stroke-linejoin' && value !== 'round') throw Error('скруглённая обводка обязательна');
        if (node.name === 'rect' && ['rx', 'ry'].includes(key) && !(Number(value) >= 3 && Number(value) <= 6)) throw Error('скругления должны быть 3..6');
      }
    }
    if (!shapes || accents !== 1) throw Error(`нужны фигуры и ровно один акцент, найдено ${accents}`);
    passed++;
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
  }
}
for (const error of errors) console.error(`FAIL ${error}`);
console.log(`Иконки: ${passed}/${wanted.length}; ошибок: ${errors.length}`);
process.exitCode = errors.length ? 1 : 0;
