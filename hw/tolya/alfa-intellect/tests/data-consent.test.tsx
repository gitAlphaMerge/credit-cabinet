import assert from "node:assert/strict";
import test from "node:test";
import type { ChangeEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataConsent } from "../src/DataConsent";
import type { Questionnaire } from "../shared/mvp2";

test("One consent checkbox is checked only when all three saved permissions exist", () => {
  for (let mask = 0; mask < 8; mask++) {
    const value = {
      registry: Boolean(mask & 1),
      financial: Boolean(mask & 2),
      bki: Boolean(mask & 4),
    };
    const html = renderToStaticMarkup(
      <DataConsent value={value} onChange={() => {}} />,
    );
    assert.equal((html.match(/type="checkbox"/g) || []).length, 1);
    assert.equal(html.includes('checked=""'), mask === 7);
    assert.match(html, /Согласие на обработку данных/);
    assert.doesNotMatch(html, /учебного сценария|юридически утверждённые/);
  }
});

test("Giving and withdrawing the combined consent updates every backend permission", () => {
  let value: Questionnaire["consents"] = {
    registry: true,
    financial: false,
    bki: true,
  };
  for (const checked of [true, false, true]) {
    const element = DataConsent({
      value,
      onChange: (next) => {
        value = next;
      },
    });
    const input = element.props.children[1].props.children[0];
    input.props.onChange({
      target: { checked },
    } as ChangeEvent<HTMLInputElement>);
    assert.deepEqual(value, {
      registry: checked,
      financial: checked,
      bki: checked,
    });
  }
});
