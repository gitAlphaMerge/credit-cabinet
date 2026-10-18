import test from "node:test";
import assert from "node:assert/strict";
import {
  cabinetSnapshot,
  day,
  addDays,
  type Facility,
} from "../shared/cabinet";
import { publicPreview } from "../server/preview";
import { trainingCabinet } from "../shared/cabinet-training";
process.env.DATABASE_PATH = ":memory:";
const { makeSchedule, syncCabinetNotices } = await import("../server/cabinet");
const today = "2026-10-18";
function state() {
  const s = publicPreview();
  s.credit = null;
  s.cabinet = undefined;
  s.documents = [];
  s.selections = [];
  return s;
}
function facility(): Facility {
  return {
    id: "loan",
    kind: "loan",
    name: "Кредит",
    amount: 120000,
    balance: 100000,
    rate: 12,
    term: 12,
    startDate: today,
    asOf: today,
    quality: "manual",
    source: "Подтверждено пользователем",
    events: makeSchedule(100000, 12, 12, addDays(today, 3)),
  };
}
function filled() {
  const s = state();
  s.cabinet = {
    facility: facility(),
    plan: {
      balance: 1000,
      balanceDate: today,
      through: addDays(today, 29),
      source: "Датированный полный план",
      confirmedAt: today,
      items: [
        { id: "one", date: addDays(today, 2), amount: -500, label: "Расход" },
        { id: "two", date: addDays(today, 4), amount: 20000, label: "Доход" },
      ],
    },
  };
  return s;
}
test("Новый кабинет: неизвестный кредит и остаток не превращаются в нули, старые предположения не используются", () => {
  const v = cabinetSnapshot(state(), today);
  assert.equal(v.facility, null);
  assert.equal(v.cash.balance, null);
  assert.equal(v.cash.net, null);
  assert.equal(v.forecast.available, false);
  assert.ok(v.metrics.every((m) => m.value === null));
  assert.equal(v.signals.length, 0);
});
test("Единый график: аннуитет, рубли, конечный ноль и календарь конца месяца", () => {
  for (const rate of [0, 12, 22]) {
    const events = makeSchedule(100000, rate, 12, "2026-01-31");
    assert.equal(events[1].date, "2026-02-28");
    assert.equal(events[2].date, "2026-03-31");
    assert.equal(events.at(-1)!.balance, 0);
    assert.ok(
      Math.abs(events.reduce((n, p) => n + p.principal, 0) - 100000) < 0.01,
    );
    let b = 100000;
    for (const e of events) {
      assert.ok(Math.abs(b - e.principal - e.balance) < 0.01);
      b = e.balance;
    }
  }
});
test("Прогноз: расходы/долг до поступления, правильный дефицит и минимум, общий период", () => {
  const s = filled(),
    v = cabinetSnapshot(s, today),
    p = v.next!;
  assert.equal(v.forecast.available, true);
  assert.equal(
    v.forecast.afterNext,
    Math.round((500 - p.principal - p.interest) * 100) / 100,
  );
  assert.equal(v.forecast.minimumDate, addDays(today, 3));
  assert.ok(v.forecast.deficit! > 0);
  assert.ok(v.signals.some((r) => r.key.startsWith("deficit:")));
  assert.equal(v.progress, 100 * (1 - 100000 / 120000));
});
test("Прошедшая дата не означает просрочку; неполный или старый план не даёт прогноз", () => {
  const s = filled();
  s.cabinet!.facility!.events[0].date = addDays(today, -1);
  let v = cabinetSnapshot(s, today);
  assert.equal(v.unresolved[0].status, "planned");
  assert.equal(v.forecast.available, false);
  s.cabinet!.facility!.events[0].date = addDays(today, 3);
  s.cabinet!.plan!.through = addDays(today, 2);
  assert.equal(cabinetSnapshot(s, today).forecast.available, false);
  s.cabinet!.plan!.through = addDays(today, 29);
  s.cabinet!.plan!.balanceDate = addDays(today, -8);
  assert.equal(cabinetSnapshot(s, today).forecast.available, false);
});
test("Начальный остаток с прошлой даты не становится минимумом текущего горизонта", () => {
  const s = filled();
  s.cabinet!.plan!.balanceDate = addDays(today, -1);
  s.cabinet!.plan!.items = [
    { id: "x", date: addDays(today, -1), amount: 50000, label: "Приход" },
  ];
  const f = cabinetSnapshot(s, today).forecast;
  assert.ok(f.minimum! > 1000);
  assert.ok(f.minimumDate! >= today);
});
test("Выписка: 30 дней, поступления и списания всех видов, без подмены прибыли и CFADS", () => {
  const s = filled();
  s.cabinet!.facility!.startDate = addDays(today, -60);
  s.documents = [
    {
      id: "st",
      category: "statement",
      name: "Выписка",
      createdAt: today,
      period: addDays(today, -29) + " — " + today,
      currency: "RUB",
      mime: "text/csv",
      confirmed: true,
      fields: { freeFlow: 1000000 },
      records: [
        { date: addDays(today, -30), amount: 999999, kind: "operating" },
        { date: addDays(today, -29), amount: 100000, kind: "financing" },
        { date: today, amount: -20000, kind: "debt", balance: 0 },
      ],
    },
  ];
  const v = cabinetSnapshot(s, today);
  assert.equal(v.cash.net, 80000);
  assert.equal(v.cash.balance, 0);
  assert.equal(v.metrics[0].value, null);
  assert.notEqual(v.metrics[1].value, null);
  s.documents[0].period = addDays(today, -10) + " — " + today;
  assert.equal(cabinetSnapshot(s, today).metrics[1].value, null);
});
test("DSCR: только отдельный CFADS, сопоставимый график и точные зоны 1,0 / 1,3", () => {
  const s = filled(),
    e = s.cabinet!.facility!.events[0],
    debt = e.principal + e.interest;
  s.cabinet!.coverage = {
    amount: debt * 1.3,
    start: today,
    end: addDays(today, 29),
    source: "Расчёт CFADS",
    methodology:
      "Операционный поток после налогов и обязательных корректировок",
    confirmedAt: today,
  };
  let m = cabinetSnapshot(s, today).metrics[0];
  assert.equal(m.tone, "good");
  s.cabinet!.coverage!.amount = debt;
  assert.equal(cabinetSnapshot(s, today).metrics[0].tone, "warning");
  s.cabinet!.coverage!.amount = debt * 0.99;
  assert.equal(cabinetSnapshot(s, today).metrics[0].tone, "danger");
  s.cabinet!.coverage!.end = "2030-01-01";
  assert.equal(cabinetSnapshot(s, today).metrics[0].value, null);
});
test("ОФР: рост выручки и прибыль от продаж; нулевая база и несопоставимые периоды", () => {
  const s = state();
  s.documents = [
    {
      id: "pnl",
      category: "pnl",
      name: "ОФР",
      confirmed: true,
      currency: "RUB",
      mime: "text/csv",
      createdAt: today,
      period: "2026 / 2025",
      fields: {
        revenue: 200,
        previousRevenue: 100,
        profit: 99,
        salesProfit: 20,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        previousStart: "2024-01-01",
        previousEnd: "2024-12-31",
      },
    },
  ];
  let m = cabinetSnapshot(s, today).metrics;
  assert.equal(m[2].value, 100);
  assert.equal(m[3].value, 10);
  assert.equal(m[3].tone, "neutral");
  s.documents[0].fields.previousRevenue = 0;
  assert.equal(cabinetSnapshot(s, today).metrics[2].value, null);
  delete s.documents[0].fields.salesProfit;
  assert.equal(cabinetSnapshot(s, today).metrics[3].value, null);
});
test("Линия и овердрафт не получают прогресс погашения разового кредита", () => {
  const s = filled();
  for (const kind of ["line", "overdraft"] as const) {
    s.cabinet!.facility!.kind = kind;
    s.cabinet!.facility!.limit = 200000;
    assert.equal(cabinetSnapshot(s, today).progress, null);
  }
});
test("Уведомления: дедупликация, read, актуализация риска и отключение решённого сигнала", () => {
  const s = filled();
  syncCabinetNotices(s, today);
  const n = s.notifications.length;
  s.notifications.forEach((n) => (n.read = true));
  syncCabinetNotices(s, today);
  assert.equal(s.notifications.length, n);
  assert.ok(s.notifications.every((n) => n.read));
  s.cabinet!.plan!.balance = 100000;
  syncCabinetNotices(s, today);
  assert.equal(
    s.notifications.find((n) => n.key.includes("deficit"))!.active,
    false,
  );
});
test("Учебные значения — чистое UI-преобразование, исходный аккаунт не мутирует", () => {
  const s = publicPreview(),
    before = JSON.stringify(s),
    trained = trainingCabinet(s);
  assert.equal(JSON.stringify(s), before);
  assert.ok(trained.cabinet?.facility);
  assert.ok(cabinetSnapshot(trained, day()).forecast.available);
  assert.equal(s.cabinet, undefined);
});
