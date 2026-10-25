import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ApplicationWorkspace } from "../src/ApplicationWorkspace";
import { JourneyProgress } from "../src/JourneyProgress";
import { CompanyCard } from "../src/CompanyCard";
test("Workspace owns one title, a separate scrolling form, actions and persistent mobile panels", () => {
  const html = renderToStaticMarkup(
    <ApplicationWorkspace
      title="Компания"
      description="Проверим сведения"
      navigation={<button>Компания</button>}
      footer={<button form="request">Продолжить</button>}
      agent={<div>Помощник</div>}
      scrollRef={{ current: null }}
      screenKey="company"
    >
      <form id="request">
        <input />
      </form>
    </ApplicationWorkspace>,
  );
  assert.equal((html.match(/<h1/g) || []).length, 1);
  assert.match(html, /credit-form-scroll/);
  assert.match(html, /credit-form-actions/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-controls=/);
  const css = readFileSync(
    new URL("../src/journey-workspace.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /grid-template-columns: minmax\(0, 3fr\) minmax\(0, 2fr\)/);
  assert.match(css, /data-mobile-panel/);
});
test("Global credit journey and missing OKVED description are explicit", () => {
  const html = renderToStaticMarkup(<JourneyProgress current={1} />);
  for (const name of ["Подбор", "Данные бизнеса", "Проверка", "Результат"])
    assert.match(html, new RegExp(name));
  assert.match(html, /aria-current="step"/);
  const card = renderToStaticMarkup(
    <CompanyCard
      company={{
        name: "ООО",
        inn: "9900000001",
        form: "ООО",
        status: "ACTIVE",
        source: "Тестовый реестр",
        okved: "31.09",
      }}
    />,
  );
  assert.match(card, /Расшифровка в справочнике отсутствует/);
});
