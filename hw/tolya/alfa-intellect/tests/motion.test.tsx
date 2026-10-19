import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroFinance, heroScenes } from "../src/HeroFinance";
import { Preparation, preparationStages } from "../src/Preparation";
import {
  PREPARATION_MS,
  PREPARATION_KEY,
  preparationProgress,
  readPreparation,
} from "../src/preparation-state";
test("Прогресс подготовки ограничен 0–100 и длится десять секунд", () => {
  assert.equal(PREPARATION_MS, 10000);
  assert.deepEqual(
    [-100, 0, 2500, 5000, 9999, 10000, 50000].map((t) =>
      preparationProgress(t),
    ),
    [0, 0, 25, 50, 99, 100, 100],
  );
  assert.equal(preparationProgress(800, 800), 100);
});
test("Перезагрузка восстанавливает лишь свежую метку подготовки без персональных данных", () => {
  const now = 100000;
  const storage = (value: string | null) => ({
    getItem: (key: string) => {
      assert.equal(key, PREPARATION_KEY);
      return value;
    },
  });
  assert.equal(readPreparation(storage("95000"), now), 95000);
  for (const value of [null, "", "oops", "0", "-1", "200000", "1000"])
    assert.equal(readPreparation(storage(value), now), null);
  assert.equal(
    readPreparation({
      getItem() {
        throw new Error("Denied");
      },
    }),
    null,
  );
});
test("Хиро: три сцены с управлением и честной маркировкой иллюстрации", () => {
  const html = renderToStaticMarkup(<HeroFinance />);
  assert.equal(heroScenes.length, 3);
  assert.match(html, /Приостановить анимацию/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Иллюстративные данные/);
  assert.match(html, /не предложение банка/);
});
test("Подготовка: доступный прогресс, переход сразу, без выдуманного обучения модели", () => {
  const html = renderToStaticMarkup(
    <Preparation onComplete={async () => {}} />,
  );
  assert.equal(preparationStages.length, 4);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="0"/);
  assert.match(html, /Перейти сразу/);
  assert.ok(!preparationStages.some((s) => /обучаем|инфраструктуру/i.test(s)));
});
