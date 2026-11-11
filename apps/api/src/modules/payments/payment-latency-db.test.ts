import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { env } from "../../config/env.js";
import { Order } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { orderTrackingToken } from "../../realtime/socket-security.js";
import { mercadoPagoRouter } from "./mercado-pago.routes.js";
import { warmPaymentStatus } from "./payment-refresh.js";

test("Pix/cartão: primeira tela não espera o provedor; consultas simultâneas compartilham a verificação", { skip: process.env.RUN_DB_PAYMENT_LATENCY_TESTS !== "true", timeout: 20000 }, async () => {
  const app = express(); app.use("/payments", mercadoPagoRouter);
  const server = app.listen(0, "127.0.0.1");
  if (!server.listening) await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const nativeFetch = globalThis.fetch, previousToken = env.mercadoPagoAccessToken;
  const mutableEnv = env as { mercadoPagoAccessToken: string }; mutableEnv.mercadoPagoAccessToken = "TEST-performance-only";
  const ids: string[] = [];
  let release = () => {};
  try {
    for (const method of ["PIX", "CREDIT_CARD"] as const) {
      const id = randomUUID(); ids.push(id);
      const providerId = method === "PIX" ? `ORD${id.replaceAll("-", "")}` : `QA${id}`;
      const order = await Order.create({ id, customerName: "QA latência pagamento", customerPhone: "32900000000", fulfillmentType: "PICKUP", paymentMethod: method, paymentStatus: "PENDING", paymentProvider: method === "PIX" ? "MERCADO_PAGO_ORDERS" : "MERCADO_PAGO", paymentExternalId: providerId, status: "NEW", subtotal: 10, total: 10, paymentExpiresAt: new Date(Date.now() + 300000), pixCopyPaste: method === "PIX" ? "qa-copy-paste" : null, pixQrCodeBase64: method === "PIX" ? "qa-qr" : null });
      let calls = 0;
      const held = new Promise<void>(resolve => { release = resolve; });
      globalThis.fetch = async (url, init) => {
        if (!String(url).startsWith("https://api.mercadopago.com/")) return nativeFetch(url, init);
        assert.equal(init?.method ?? "GET", "GET", "O teste não pode gerar cobranças");
        calls++; await held;
        return new Response(JSON.stringify(method === "PIX" ? { id: providerId, external_reference: id, status: "action_required", transactions: { payments: [{ id: "QA", status: "action_required", payment_method: { id: "pix" } }] } } : { id: providerId, external_reference: id, status: "pending", transaction_amount: 10 }), { status: 200 });
      };
      const path = method === "PIX" ? "orders" : "card/orders";
      const url: string = `http://127.0.0.1:${address.port}/payments/${path}/${id}?initial=1`;
      const headers = { "X-Order-Token": orderTrackingToken(id) };
      const response: Response = await nativeFetch(url, { headers, signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 200);
      const state = await response.json(); assert.equal(state.paymentStatus, "PENDING");
      if (method === "PIX") { assert.equal(state.pixCopyPaste, "qa-copy-paste"); assert.equal(state.qrCodeBase64, "qa-qr"); }
      const repeated = await nativeFetch(url, { headers, signal: AbortSignal.timeout(3000) }); assert.equal(repeated.status, 200);
      assert.equal(calls, 1);
      const verification = warmPaymentStatus(order); release(); await verification;
      assert.equal((await order.reload()).getDataValue("paymentStatus"), "PENDING");
      assert.equal((await nativeFetch(url)).status, 401);
    }
  } finally {
    release(); globalThis.fetch = nativeFetch; mutableEnv.mercadoPagoAccessToken = previousToken;
    for (const id of ids) await Order.destroy({ where: { id } });
    await new Promise<void>(resolve => server.close(() => resolve())); await sequelize.close();
  }
});
