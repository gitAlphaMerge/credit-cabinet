import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { loadCreditPdf, CreditContract } from "../src/CreditDocument";
import { setApiWorkspace } from "../src/api";
import type { MvpApplication } from "../shared/mvp2";
test("PDF loader renders only actual backend PDF bytes and sends the workspace scope", async () => {
  const original = globalThis.fetch;
  setApiWorkspace("test-owner");
  try {
    globalThis.fetch = async (_input, init) => {
      assert.equal(
        (init?.headers as Record<string, string>)["X-Journey-Workspace"],
        "test-owner",
      );
      assert.equal(init?.credentials, "same-origin");
      return new Response("%PDF-1.7\nbackend document", {
        headers: { "Content-Type": "application/pdf" },
      });
    };
    assert.equal(
      await (await loadCreditPdf("/api/document")).text(),
      "%PDF-1.7\nbackend document",
    );
    globalThis.fetch = async () =>
      new Response("<html>login</html>", {
        headers: { "Content-Type": "text/html" },
      });
    await assert.rejects(loadCreditPdf("/api/document"), /не вернул PDF/);
    globalThis.fetch = async () => new Response("missing", { status: 404 });
    await assert.rejects(
      loadCreditPdf("/api/document"),
      /Не удалось загрузить/,
    );
  } finally {
    globalThis.fetch = original;
    setApiWorkspace(null);
  }
});
test("signature requires reading; signed contract offers viewing and receiving, not a second signature", () => {
  const a = {
    id: "a",
    contract: { number: "MVP-a", date: "2026-10-25" },
  } as MvpApplication;
  const props = {
    application: a,
    busy: false,
    summary: <p>Сумма: 1 млн ₽</p>,
    onSign() {},
    onReturn() {},
    onReceive() {},
  };
  const unsigned = renderToStaticMarkup(<CreditContract {...props} />);
  assert.match(unsigned, /disabled=""[^>]*>Подписать электронной подписью/);
  assert.match(unsigned, /Проверьте условия договора перед подписанием/);
  assert.doesNotMatch(unsigned, /MVP-a/);
  const signed = renderToStaticMarkup(
    <CreditContract
      {...props}
      application={{
        ...a,
        signature: { id: "s", at: "now", hash: "h", version: 1 },
      }}
    />,
  );
  assert.match(signed, /К получению средств/);
  assert.ok(!signed.includes("Подписать электронной подписью"));
  assert.match(signed, /Скачать договор PDF/);
});
