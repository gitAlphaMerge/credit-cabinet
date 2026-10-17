import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  composerHeight,
  COMPOSER_MAX_HEIGHT,
  filterChats,
  STARTER_PROMPTS,
} from "../src/chat-ui";
import { ChatComposer } from "../src/ChatComposer";
import { ChatHistory } from "../src/ChatHistory";
import { WorkspaceContext, type Workspace } from "../src/context";
import { publicPreview } from "../server/preview";
const s = publicPreview();
s.chats = [
  { id: "one", title: "Оборудование", messages: [] },
  { id: "two", title: "Оборотные средства", messages: [] },
];
s.documents = [
  {
    id: "doc",
    category: "statement",
    name: "Выписка.csv",
    period: "2026",
    fields: {},
    confirmed: false,
    createdAt: "2026-10-17",
    currency: "RUB",
    mime: "text/csv",
  },
];
const workspace = (extra: Partial<Workspace> = {}): Workspace => ({
  state: s,
  config: {},
  go() {},
  refresh: async () => {},
  act: async () => {},
  error() {},
  activeChatId: "one",
  setActiveChatId() {},
  draft: "",
  setDraft() {},
  historyOpen: true,
  setHistoryOpen() {},
  upload: async () => {},
  uploading: false,
  reviewDocument() {},
  financingDraft: {},
  financingDraftStored: false,
  cacheFinancingDraft() {},
  chatVisible: true,
  setChatVisible() {},
  setSplit() {},
  sendMessage: async () => {},
  sending: null,
  ...extra,
});
test("Composer: высота ограничена и корректна для пустого/длинного текста", () => {
  assert.equal(COMPOSER_MAX_HEIGHT, 180);
  assert.deepEqual(
    [0, 24, 60, 181, 1000, NaN].map(composerHeight),
    [24, 24, 60, 180, 180, 24],
  );
});
test("Поиск диалогов: регистр, русские названия, пробелы и пустой результат", () => {
  assert.deepEqual(
    filterChats(s.chats, "  ОБОРУД  ").map((c) => c.id),
    ["one"],
  );
  assert.equal(filterChats(s.chats, "").length, 2);
  assert.equal(filterChats(s.chats, "нет совпадений").length, 0);
  assert.equal(STARTER_PROMPTS.length, 3);
  assert.ok(!STARTER_PROMPTS.includes("Подобрать финансирование"));
});
test("Composer: единое поле, рабочие действия, пустой send недоступен", () => {
  const html = renderToStaticMarkup(
    <WorkspaceContext.Provider value={workspace()}>
      <ChatComposer chatId="one" />
    </WorkspaceContext.Provider>,
  );
  assert.equal((html.match(/<textarea/g) || []).length, 1);
  assert.match(html, /Прикрепить документ/);
  assert.match(html, /Отправить сообщение/);
  assert.match(html, /Подобрать финансирование/);
  assert.match(html, /disabled=""/);
});
test("Плашки файлов привязаны к диалогу, не являются удалением документа", () => {
  const render = (chatId: string) =>
    renderToStaticMarkup(
      <WorkspaceContext.Provider
        value={workspace({ chatFiles: [{ chatId: "one", docId: "doc" }] })}
      >
        <ChatComposer chatId={chatId} />
      </WorkspaceContext.Provider>,
    );
  assert.match(render("one"), /Выписка.csv/);
  assert.match(render("one"), /Скрыть плашку/);
  assert.match(render("one"), /Проверить данные документа/);
  assert.ok(!render("two").includes("Выписка.csv"));
  assert.equal(s.documents.length, 1);
});
test("Закрытая история inert и aria-hidden, переименование не вложено в кнопку диалога", () => {
  const html = renderToStaticMarkup(
    <WorkspaceContext.Provider value={workspace({ historyOpen: false })}>
      <ChatHistory drawer activeId="one" onNew={() => {}} onRename={() => {}} />
    </WorkspaceContext.Provider>,
  );
  assert.match(html, /inert=""/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /Поиск по истории/);
  assert.match(html, /Переименовать диалог: Оборудование/);
  assert.ok(!html.includes('aria-modal="true"'));
});
