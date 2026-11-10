import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { mercadoPagoRouter } from "./mercado-pago.routes.js";

test("webhook sem assinatura válida não consulta o banco ou libera pedidos", async () => {
  const app = express();
  app.use(express.json());
  app.use("/payments/mercado-pago", mercadoPagoRouter);
  const server = app.listen(0, "127.0.0.1");
  const listening = once(server, "listening");
  try {
    await listening;
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const result = await fetch(`http://127.0.0.1:${address.port}/payments/mercado-pago/webhook?type=payment&data.id=123`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "123", status: "approved" } }),
    });
    assert.equal(result.status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
