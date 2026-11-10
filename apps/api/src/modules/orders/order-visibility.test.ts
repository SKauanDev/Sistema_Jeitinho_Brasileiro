import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { adminRouter } from "../admin/admin.routes.js";
import { orderRouter } from "./order.routes.js";
import { mercadoPagoRouter } from "../payments/mercado-pago.routes.js";
import { Order, User } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";

test("pedido 19: visível no admin, itens no acompanhamento e avanço bloqueado sem pagamento", { skip: process.env.RUN_DB_VALIDATION_TESTS !== "true" }, async () => {
  const app = express(); app.use(express.json()); app.use("/admin", adminRouter); app.use("/orders", orderRouter);
  app.use("/payments/mercado-pago", mercadoPagoRouter);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const admin = await User.findOne({where:{role:"ADMIN",active:true}}); assert.ok(admin);
    const headers = { Authorization: `Bearer ${jwt.sign({ role: "ADMIN", sub: String(admin.getDataValue("id")) }, env.jwtSecret, { expiresIn: "1m" })}`, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/admin/orders`)).status, 401);
    const response = await fetch(`${base}/admin/orders`, { headers }); assert.equal(response.status, 200);
    const orders = await response.json() as Array<{ id: string; displayNumber: number; paymentStatus: string }>;
    const order = orders.find(value => Number(value.displayNumber) === 19); assert.ok(order);
    assert.equal((await fetch(`${base}/orders/${order.id}`)).status,401);
    const detailResponse = await fetch(`${base}/orders/${order.id}`,{headers}); assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json() as { items: Array<{ selectedOptions: unknown[] }>; statusHistory: unknown[]; status: string; paymentStatus: string };
    assert.ok(detail.items.length > 0); assert.ok(Array.isArray(detail.items[0]?.selectedOptions)); assert.ok(detail.statusHistory.length > 0);
    if (detail.paymentStatus === "EXPIRED") {
      const stateResponse = await fetch(`${base}/payments/mercado-pago/card/orders/${order.id}`,{headers});
      assert.equal(stateResponse.status, 200);
      const state = await stateResponse.json() as { orderStatus: string; cancellationReason: string };
      assert.equal(state.orderStatus, "CANCELED");
      assert.equal(state.cancellationReason, "Cancelado por falta de pagamento");
      const retry = await fetch(`${base}/payments/mercado-pago/card/orders/${order.id}`, { method: "POST", headers, body: JSON.stringify({}) });
      assert.equal(retry.status, 409);
    }
    if (!["APPROVED", "NOT_REQUIRED"].includes(order.paymentStatus)) {
      const advance = await fetch(`${base}/admin/orders/${order.id}/status`, { method: "PATCH", headers, body: JSON.stringify({ status: "CONFIRMED" }) });
      assert.equal(advance.status, 409);
      const unchanged = await Order.findByPk(order.id);
      assert.equal(unchanged?.getDataValue("status"), detail.status);
      assert.equal(unchanged?.getDataValue("paymentStatus"), detail.paymentStatus);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await sequelize.close();
  }
});
