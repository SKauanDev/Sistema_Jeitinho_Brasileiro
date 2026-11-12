import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import { Category, DiningSession, DiningTable, Order, OrderItem, OrderItemOption, OrderStatusHistory, Product, StoreSetting, User } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";
import { getStoreSetting } from "../settings/store-operation.service.js";
import { createOrderRouter } from "../orders/order.routes.js";
import { adminDiningRouter, createDiningRouter } from "./dining.routes.js";
import { pizzaRulesRouter } from "../catalog/pizza-rules.js";
import { adminRouter } from "../admin/admin.routes.js";

test("MySQL/HTTP: comanda abre, acumula consumo, fecha, rejeita sessão antiga; pedido manual recebido exige equipe", { skip: process.env.RUN_DB_DINING_TESTS !== "true", timeout: 60000 }, async () => {
  const suffix = randomUUID(), categoryId = randomUUID(), firstId = randomUUID(), secondId = randomUUID(), tableId = randomUUID(), borderId = randomUUID(), key = randomBytes(32).toString("hex");
  const phone = `329${String(Date.now()).slice(-8)}`;
  const server = express(); server.use(express.json());
  const setting = await getStoreSetting();
  const number = 10000 + Math.floor(Math.random() * 1000000);
  const settings = StoreSetting.build({ ...setting.get({ plain: true }), tableCount: number, allowPickup: true, minimumOrder: 0, cashEnabled: true, pizzaRules: { traditional: [{ size: "G", price: 59 }], mixed: [{ size: "G", price: 89 }], borders: [{ id: borderId, name: "Borda QA", type: "SAVORY", price: 12, active: true }] } });
  server.use("/orders", createOrderRouter({ isOpen: async () => true, settings: async () => settings }));
  server.use("/tables", createDiningRouter(async () => true, number)); server.use("/admin", adminRouter); server.use("/admin/tables", adminDiningRouter); server.use("/pizza-rules", pizzaRulesRouter);
  const http = server.listen(0, "127.0.0.1"); await once(http, "listening");
  const address = http.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const events: string[] = []; server.set("io", { to: () => ({ emit: (name: string) => events.push(name) }) });
  const request = (path: string, method = "GET", body?: unknown, token?: string) => fetch(url + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    await DiningTable.create({ id: tableId, number, accessKey: key });
    await Category.create({ id: categoryId, name: `Pizzas QA ${suffix}`, slug: `qa-${suffix}`, active: true });
    await Product.bulkCreate([{ id: firstId, categoryId, name: "Pizza QA A", price: 1, pizzaSlots: 1, sizes: [{ size: "G", price: 70 }], active: true }, { id: secondId, categoryId, name: "Pizza QA B", price: 1, pizzaSlots: 1, sizes: [{ size: "G", price: 80 }], active: true }]);
    const admin = await User.findOne({ where: { role: "ADMIN", active: true } }); assert.ok(admin);
    const token = jwt.sign({ sub: admin.getDataValue("id"), role: "ADMIN" }, env.jwtSecret, { expiresIn: "5m" });
    assert.equal((await request("/admin/tables")).status, 401);
    assert.equal((await request("/pizza-rules", "PUT", { borders: [] })).status, 401);
    assert.equal((await request("/pizza-rules", "PUT", { borders: [{ name: "x", type: "SAVORY", price: -1 }] }, token)).status, 400);
    const opened = await request(`/tables/${key}/open`, "POST"); assert.equal(opened.status, 200);
    const initial = await opened.json(); assert.ok(initial.sessionId);
    const again = await (await request(`/tables/${key}/open`, "POST")).json(); assert.equal(again.sessionId, initial.sessionId);
    const item = { productId: firstId, quantity: 2, size: "G", unitPrice: .01, pizzaSelections: [{ mode: "half", leftId: firstId, rightId: secondId, borderId }], options: [{ name: "Borda falsa", price: .01 }] };
    const body = { table: { key, sessionId: initial.sessionId }, items: [item], notes: "Sem cebola" };
    const created = await request("/orders", "POST", body); assert.equal(created.status, 201, await created.clone().text());
    const id = (await created.json()).id;
    const stored = await Order.findByPk(id); assert.ok(stored);
    assert.equal(stored.getDataValue("customerName"), `Mesa ${number}`); assert.equal(stored.getDataValue("tableNumber"), number);
    assert.equal(Number(stored.getDataValue("subtotal")), 142); assert.equal(Number(stored.getDataValue("total")), 142); assert.equal(Number(stored.getDataValue("digitalSecurityFee")), 0);
    const summary = await (await request(`/tables/${key}`)).json(); assert.equal(summary.total, 142); assert.equal(summary.orders.length, 1); assert.equal(summary.orders[0].customerPhone, undefined);
    assert.ok(events.includes("order:new"));
    const changed = await request(`/admin/tables/${tableId}/close`, "POST", { sessionId: initial.sessionId, expectedTotal: 1, paymentMethod: "CASH" }, token); assert.equal(changed.status, 409);
    assert.equal((await request("/admin/tables/count", "PUT", { count: Number(setting.getDataValue("tableCount")) }, token)).status, 409);
    assert.equal((await request(`/admin/tables/${tableId}/close`, "POST", { sessionId: initial.sessionId, expectedTotal: 142, paymentMethod: "CASH" })).status, 401);
    const closed = await request(`/admin/tables/${tableId}/close`, "POST", { sessionId: initial.sessionId, expectedTotal: 142, paymentMethod: "PIX", notes: "Recebido QA" }, token); assert.equal(closed.status, 200); assert.equal((await closed.json()).total, 142);
    assert.equal((await request(`/admin/orders/${id}/status`, "PATCH", { status: "CANCELED", reason: "QA" }, token)).status, 409);
    assert.equal((await request("/orders", "POST", body)).status, 409);
    const reopened = await (await request(`/tables/${key}/open`, "POST")).json(); assert.notEqual(reopened.sessionId, initial.sessionId); assert.equal(reopened.total, 0);
    assert.equal((await request(`/admin/tables/${tableId}/close`, "POST", { sessionId: initial.sessionId, expectedTotal: 142, paymentMethod: "CASH" }, token)).status, 409);
    assert.equal((await request(`/tables/${"0".repeat(64)}`)).status, 404);
    const manual = { manual: true, customerName: "QA manual", customerPhone: phone, fulfillmentType: "PICKUP", paymentMethod: "RECEIVED_ONLINE", items: [item] };
    assert.equal((await request("/orders", "POST", manual)).status, 403);
    assert.equal((await request("/orders", "POST", { ...manual, manual: false })).status, 403);
    const received = await request("/orders", "POST", manual, token); assert.equal(received.status, 201, await received.clone().text());
    const paid = await Order.findByPk((await received.json()).id); assert.ok(paid); assert.equal(paid.getDataValue("paymentStatus"), "APPROVED"); assert.ok(paid.getDataValue("paidAt")); assert.equal(Number(paid.getDataValue("total")), 142.99);
    assert.equal(await DiningSession.count({ where: { tableId, closedAt: { [Op.ne]: null } } }), 1);
  } finally {
    const sessions = await DiningSession.findAll({ where: { tableId }, attributes: ["id"] });
    const orders = await Order.findAll({ where: { [Op.or]: [{ diningSessionId: { [Op.in]: sessions.map(session => session.getDataValue("id")) } }, { customerPhone: phone }] } });
    for (const order of orders) {
      const orderId = order.getDataValue("id");
      for (const item of await OrderItem.findAll({ where: { orderId } })) await OrderItemOption.destroy({ where: { orderItemId: item.getDataValue("id") } });
      await OrderItem.destroy({ where: { orderId } }); await OrderStatusHistory.destroy({ where: { orderId } }); await order.destroy();
    }
    await DiningSession.destroy({ where: { tableId } }); await DiningTable.destroy({ where: { id: tableId } });
    await Product.destroy({ where: { categoryId } }); await Category.destroy({ where: { id: categoryId } });
    await new Promise<void>(resolve => http.close(() => resolve())); await sequelize.close();
  }
});
