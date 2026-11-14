import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import { Courier, FinancialEntry, Order, OrderEdit, OrderItem, OrderItemOption, OrderStatusHistory, User } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";
import { financeRouter } from "./finance.routes.js";
import { courierRouter } from "../settings/courier.routes.js";
import { orderEditRouter } from "../admin/order-edit.routes.js";
import { createDiningRouter } from "../dining/dining.routes.js";

test("MySQL: resumo financeiro por canal e motoboy; exclusão mantém histórico; scanner exige equipe", { skip: process.env.RUN_DB_FINANCE_REFINEMENT_TESTS !== "true", timeout: 60000 }, async () => {
  const userId = randomUUID(), kitchenId = randomUUID(), rider1 = randomUUID(), rider2 = randomUUID(), entryIds = [randomUUID(), randomUUID()], ids: string[] = [];
  const app = express(); app.use(express.json()); app.use("/finance", financeRouter); app.use("/couriers", courierRouter); app.use("/edits", orderEditRouter); app.use("/tables", createDiningRouter());
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const token = jwt.sign({ sub: userId, role: "ADMIN" }, env.jwtSecret, { expiresIn: "3m" });
  const kitchen = jwt.sign({ sub: kitchenId, role: "KITCHEN" }, env.jwtSecret, { expiresIn: "3m" });
  const request = (path: string, method = "GET", body?: unknown, auth: string | null = token) => fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: new URL(env.webUrl).origin, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const create = async (changes: object) => { const order = await Order.create({ customerName: "QA financeiro", customerPhone: "32900000001", fulfillmentType: "PICKUP", street: "Rua QA", number: "1", neighborhood: "Bairro QA", city: "Cidade QA", state: "MG", status: "COMPLETED", paymentMethod: "CASH", paymentStatus: "APPROVED", subtotal: 4, total: 4, createdAt: new Date("2001-06-14T15:00:00Z"), ...changes }); ids.push(String(order.getDataValue("id"))); return order; };
  try {
    for (const [id, role] of [[userId, "ADMIN"], [kitchenId, "KITCHEN"]]) await User.create({ id, name: "QA financeiro", username: id, email: `${id}@example.invalid`, role, passwordHash: "QA-only", active: true });
    await Courier.bulkCreate([{ id: rider1, name: "Motoboy QA 1", phone: "31999991234", active: true }, { id: rider2, name: "Motoboy QA 2", phone: "31999991235", active: true }]);
    const phone = await request(`/couriers/${rider1}`, "PATCH", { phone: "31999991234" }); assert.equal(phone.status, 200); assert.equal((await phone.json()).phone, "(31) 99999-1234");
    assert.equal((await request(`/couriers/${rider1}`, "PATCH", { phone: "123" })).status, 400);
    await create({ fulfillmentType: "DELIVERY", subtotal: 10, discountAmount: 1, deliveryFee: 3, digitalSecurityFee: 1, total: 13, courierId: rider1, courierName: "Motoboy QA 1" });
    await create({ tableNumber: 1, subtotal: 20, serviceFee: 2, serviceFeeAccepted: true, total: 22 });
    const historical = await create({ fulfillmentType: "DELIVERY", subtotal: 12, deliveryFee: 4, total: 16, courierId: rider2, courierName: "Motoboy QA 2" });
    await create({ createdAt: new Date("2001-06-15T02:45:00Z") });
    await create({ createdAt: new Date("2001-06-15T03:00:00Z"), subtotal: 999, total: 999 });
    await create({ status: "CANCELED", subtotal: 999, total: 999 });
    await FinancialEntry.bulkCreate([{ id: entryIds[0], type: "IN", amount: 2, category: "QA", description: "QA manual", entryDate: "2001-06-14" }, { id: entryIds[1], type: "OUT", amount: 1, category: "QA", description: "QA automático", entryDate: "2001-06-14", sourceId: `QA:${entryIds[1]}` }]);
    const url = "/finance?period=custom&start=2001-06-14&end=2001-06-14";
    const result = await (await request(url)).json();
    assert.equal(result.kpis.revenue, 55); assert.equal(result.kpis.serviceFees, 2); assert.equal(result.kpis.deliveryFees, 7); assert.equal(result.kpis.discounts, 1); assert.equal(result.cashFlow.balance, 56);
    assert.equal(result.chart.length, 1); assert.equal(result.chart[0].date, "2001-06-14"); assert.equal(result.chart[0].revenue, 57); assert.equal(result.chart[0].expenses, 1);
    assert.equal(result.salesChannels.find((channel: any) => channel.mode === "DINE_IN").revenue, 22);
    assert.equal(result.courierFees.find((row: any) => row.id === rider2).deliveryFees, 4);
    assert.equal((await request(`/couriers/${rider2}`, "DELETE", undefined, kitchen)).status, 403);
    assert.equal((await request(`/couriers/${rider2}`, "DELETE")).status, 204); assert.equal(await Courier.findByPk(rider2), null);
    const after = await (await request(url)).json(); assert.equal(after.kpis.deliveryFees, 7); const row = after.courierFees.find((row: any) => row.id === rider2); assert.equal(row.name, "Motoboy QA 2"); assert.equal(row.registered, false); assert.equal(row.deliveryFees, 4);
    await historical.reload();
    const draft = { ...historical.get({ plain: true }), updatedAt: new Date(historical.getDataValue("updatedAt")).toISOString(), digitalSecurityFee: 0, deliveryFee: 4, discountAmount: 0, serviceFeeAccepted: false, reason: "QA mantém motoboy anterior", items: [{ productId: null, productName: "Item QA", quantity: 1, unitPrice: 12, notes: "", options: [] }] };
    const corrected = await request(`/edits/${historical.getDataValue("id")}`, "PATCH", draft); assert.equal(corrected.status, 200, await corrected.clone().text()); assert.equal((await corrected.json()).courierId, rider2);
    const scan = { key: randomBytes(32).toString("hex") };
    assert.equal((await request("/tables/scan", "POST", scan, null)).status, 401);
    assert.equal((await request("/tables/scan", "POST", scan, kitchen)).status, 403);
    assert.equal((await request("/tables/scan", "POST", scan)).status, 404);
  } finally {
    for (const id of ids) { for (const item of await OrderItem.findAll({ where: { orderId: id } })) await OrderItemOption.destroy({ where: { orderItemId: item.getDataValue("id") } }); await OrderItem.destroy({ where: { orderId: id } }); await OrderStatusHistory.destroy({ where: { orderId: id } }); await OrderEdit.destroy({ where: { orderId: id } }); await Order.destroy({ where: { id } }); }
    await FinancialEntry.destroy({ where: { id: { [Op.in]: entryIds } } }); await Courier.destroy({ where: { id: { [Op.in]: [rider1, rider2] } } }); await User.destroy({ where: { id: { [Op.in]: [userId, kitchenId] } } });
    await new Promise<void>(resolve => server.close(() => resolve())); await sequelize.close();
  }
});
