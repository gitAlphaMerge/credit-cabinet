import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { formatPhone, normalizePhone } from "../src/phone";
import { MarkdownText } from "../src/MarkdownText";
import { SelectionResult, selectionSummary } from "../src/SelectionResult";
import { publicPreview } from "../server/preview";
test("Российский телефон: вставка +7, 7, 8 и десяти цифр даёт одну маску", () => {
  for (const value of [
    "+7 (999) 123-45-67",
    "79991234567",
    "89991234567",
    "9991234567",
  ]) {
    assert.equal(formatPhone(value), "+7 (999) 123-45-67");
    assert.equal(normalizePhone(value), "+79991234567");
  }
  assert.equal(normalizePhone("+7 (999) 12"), "");
  assert.equal(formatPhone("9"), "+7 (9");
});
test("Markdown безопасно отображает списки, выделение и таблицы без raw HTML", () => {
  const html = renderToStaticMarkup(
    <MarkdownText
      text={
        "## Итог\n**Поток**\n- Один\n- Два\n\n| Поле | Значение |\n| --- | --- |\n| Сумма | 100 |\n<img src=x onerror=alert(1)>"
      }
    />,
  );
  assert.match(html, /<h3>Итог/);
  assert.match(html, /<strong>Поток/);
  assert.match(html, /<ul>/);
  assert.match(html, /<table>/);
  assert.ok(!html.includes("<img"));
});
test("Результат: процент относится к суммам, отрицательный вывод без зелёного щита", () => {
  const s = publicPreview("ip").selections[0],
    summary = selectionSummary(s);
  assert.ok(summary.known && !summary.comfortable);
  assert.equal(
    summary.coverage,
    Math.round((s.calculation.maxAmount! / s.calculation.amount) * 100),
  );
  const html = renderToStaticMarkup(
    <SelectionResult
      item={s}
      onRevise={() => {}}
      onDiscuss={() => {}}
      onApply={() => {}}
      onDocuments={() => {}}
    />,
  );
  assert.match(html, /result-v2 caution/);
  assert.match(html, /Запрос превышает/);
  assert.match(html, /не вероятность выдачи/);
  assert.ok(!html.includes("shield-check"));
});
test("Нет денежного потока — нет фиктивной посильной суммы или процента", () => {
  const s = publicPreview("idea").selections[0],
    r = selectionSummary(s);
  assert.equal(r.known, false);
  assert.equal(r.coverage, null);
  assert.equal(r.burden, null);
  assert.equal(publicPreview("ooo").credit?.paid, 8);
});
