import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { validMercadoPagoWebhook } from "./mercado-pago-webhook.js";

test("aceita assinatura Mercado Pago válida com timestamp em milissegundos ou segundos", () => {
  const secret = "test-webhook-secret";
  const now = Date.parse("2026-09-21T12:00:00Z");
  for (const ts of [String(now), String(Math.floor(now / 1000))]) {
    const digest = createHmac("sha256", secret).update(`id:123;request-id:req-1;ts:${ts};`).digest("hex");
    assert.equal(validMercadoPagoWebhook({ secret, dataId: "123", requestId: "req-1", signature: `ts=${ts},v1=${digest}`, now }), true);
    assert.equal(validMercadoPagoWebhook({ secret, dataId: "124", requestId: "req-1", signature: `ts=${ts},v1=${digest}`, now }), false);
    assert.equal(validMercadoPagoWebhook({ secret, dataId: "123", requestId: "other", signature: `ts=${ts},v1=${digest}`, now }), false);
  }
});

test("rejeita replay, formato inválido e ausência de segredo", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");
  const ts = String(now - 6 * 60_000);
  const signature = `ts=${ts},v1=${createHmac("sha256", "secret").update(`id:123;request-id:req;ts:${ts};`).digest("hex")}`;
  assert.equal(validMercadoPagoWebhook({ secret: "secret", dataId: "123", requestId: "req", signature, now }), false);
  assert.equal(validMercadoPagoWebhook({ secret: "", dataId: "123", requestId: "req", signature, now }), false);
  assert.equal(validMercadoPagoWebhook({ secret: "secret", dataId: "123", requestId: "req", signature: "garbage", now }), false);
});

test("valida assinatura de notificação de order Pix alfanumérica", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");
  const ts = String(now);
  const id = "ORD01M28P44G5FG8RJPM579EH56FV";
  const requestId = "pix-order-request";
  const signature = `ts=${ts},v1=${createHmac("sha256", "secret").update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest("hex")}`;
  assert.equal(validMercadoPagoWebhook({ secret: "secret", dataId: id, requestId, signature, now }), true);
});
