import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import { Category, CustomerAccount, CustomerRecord, DeletionLog, DiningSession, DiningTable, InventoryItem, InventoryMovement, Order, OrderEdit, OrderItem, OrderItemOption, OrderStatusHistory, Product, User } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";
import { customerRouter, publicCustomerRouter } from "../customers/customer.routes.js";
import { developerCleanupRouter } from "./developer-cleanup.routes.js";
import { adminRouter } from "./admin.routes.js";

test("MySQL: clientes editáveis sem alterar pedidos; exclusão final exclusiva do desenvolvedor mantém estoque", { skip: process.env.RUN_DB_CUSTOMER_CLEANUP_TESTS !== "true", timeout: 60000 }, async () => {
  const categoryId = randomUUID(), productId = randomUUID(), inventoryId = randomUUID(), accountId = randomUUID(), tableId = randomUUID();
  const developerId = randomUUID(), adminId = randomUUID(), kitchenId = randomUUID(), operatorId = randomUUID();
  const suffix = String(Date.now()).slice(-8), phoneA = `329${suffix}`, phoneB = `319${suffix}`, phoneC = `119${suffix}`, phoneD = `219${suffix}`;
  const orderIds: string[] = [], sessions: string[] = [];
  const app = express(); app.use(express.json()); app.use("/admin/customers", customerRouter); app.use("/customers", publicCustomerRouter); app.use("/admin/cleanup", developerCleanupRouter); app.use("/admin", adminRouter);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const token = (id: string, role: string, extra = {}) => jwt.sign({ sub: id, role, ...extra }, env.jwtSecret, { expiresIn: "3m" });
  const developer = token(developerId, "ADMIN"), admin = token(adminId, "ADMIN", { isDeveloper: true }), kitchen = token(kitchenId, "KITCHEN"), operator = token(operatorId, "OPERATOR");
  const request = (path: string, method: string, auth?: string, body?: unknown) => fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function createOrder(status: string, extra = {}) {
    const order = await Order.create({ customerName: "Cliente QA original", customerPhone: phoneA, subtotal: 20, digitalSecurityFee: 0, deliveryFee: 0, total: 20, paymentMethod: "CASH", paymentStatus: "APPROVED", status, fulfillmentType: "PICKUP", completedAt: status === "COMPLETED" ? new Date() : null, ...extra });
    orderIds.push(String(order.getDataValue("id"))); return order;
  }
  try {
    for (const [id, role, isDeveloper] of [[developerId, "ADMIN", true], [adminId, "ADMIN", false], [operatorId, "OPERATOR", false], [kitchenId, "KITCHEN", false]] as const) await User.create({ id, name: "QA permissão", username: id, email: `${id}@example.invalid`, passwordHash: "QA-only", role, isDeveloper, active: true });
    await Category.create({ id: categoryId, name: "QA limpeza", slug: categoryId }); await Product.create({ id: productId, categoryId, name: "QA limpeza", price: 10 });
    await CustomerAccount.create({ id: accountId, phone: phoneA, email: "qa@example.invalid", emailVerifiedAt: new Date(), passwordHash: "QA-only", active: true });
    const order = await createOrder("COMPLETED", { customerAccountId: accountId, inventoryProcessedAt: new Date() }); const id = String(order.getDataValue("id"));
    const item = await OrderItem.create({ orderId: id, productId, productName: "QA limpeza", quantity: 2, unitPrice: 10, optionsTotal: 0, lineTotal: 20 }); await OrderItemOption.create({ orderItemId: item.getDataValue("id"), optionName: "QA opção", optionGroupName: "QA", priceDelta: 0 }); await OrderStatusHistory.create({ orderId: id, status: "COMPLETED" });
    await InventoryItem.create({ id: inventoryId, productId, name: "QA limpeza", currentStock: 8, minimumStock: 0, unitCost: 1 });
    await InventoryMovement.create({ inventoryItemId: inventoryId, orderId: id, type: "OUT", quantity: 2, previousStock: 10, resultingStock: 8, sourceId: `QA:${id}`, reason: "QA venda" });
    assert.equal((await request(`/admin/customers/${phoneA}`, "PATCH", undefined, { name: "x", phone: phoneA })).status, 401);
    assert.equal((await request(`/admin/customers/${phoneA}`, "DELETE", kitchen)).status, 403);
    const edited = await request(`/admin/customers/${phoneA}`, "PATCH", admin, { name: "Cliente QA atualizado", phone: phoneB, email: "novo@example.invalid" }); assert.equal(edited.status, 200, await edited.clone().text()); assert.equal((await edited.json()).phone, phoneB);
    await order.reload(); assert.equal(order.getDataValue("customerName"), "Cliente QA original"); assert.equal(order.getDataValue("customerPhone"), phoneA); assert.equal(Number(order.getDataValue("total")), 20);
    const account = await CustomerAccount.findByPk(accountId); assert.ok(account); assert.equal(account.getDataValue("phone"), phoneB); assert.equal(account.getDataValue("emailVerifiedAt"), null);
    await createOrder("COMPLETED", { customerPhone: phoneB });
    const editedAgain = await request(`/admin/customers/${phoneA}`, "PATCH", admin, { name: "Cliente QA atualizado", phone: phoneC, email: "novo@example.invalid" }); assert.equal(editedAgain.status, 200); assert.equal((await editedAgain.json()).ordersCount, 2);
    await createOrder("NEW", { customerPhone: phoneD });
    assert.equal((await request(`/admin/customers/${phoneA}`, "PATCH", admin, { name: "x", phone: phoneD, email: "" })).status, 409);
    const list = await (await request("/admin/customers", "GET", admin)).json(); const customer = list.find((entry: any) => entry.id === phoneA); assert.equal(customer.phone, phoneC); assert.equal(customer.ordersCount, 2); assert.ok(!list.some((entry: any) => entry.id === phoneB));
    const oldSession = token(accountId, "CUSTOMER");
    assert.equal((await request(`/admin/customers/${phoneA}`, "DELETE", operator)).status, 204);
    assert.equal(await CustomerAccount.findByPk(accountId), null); await order.reload(); assert.equal(order.getDataValue("customerAccountId"), null); assert.equal(Number(order.getDataValue("total")), 20);
    assert.equal((await request(`/admin/customers/${phoneA}`, "GET", admin)).status, 404); assert.equal((await request("/customers/session", "GET", oldSession)).status, 401);
    const afterDelete = await (await request("/admin/customers", "GET", admin)).json(); assert.ok(!afterDelete.some((entry: any) => [phoneA, phoneB, phoneC].includes(entry.id)));
    assert.equal((await request("/customers/register", "POST", undefined, { phone: phoneC, password: "QA-password" })).status, 403);
    for (const auth of [admin, kitchen, operator]) assert.equal((await request(`/admin/cleanup/orders/${id}`, "DELETE", auth)).status, 403);
    const adminOrders = await (await request("/admin/orders", "GET", admin)).json(); assert.equal(adminOrders.find((entry: any) => entry.id === id).canDelete, false);
    const developerOrders = await (await request("/admin/orders", "GET", developer)).json(); assert.equal(developerOrders.find((entry: any) => entry.id === id).canDelete, true);
    const unfinished = orderIds[2]!; assert.equal((await request(`/admin/cleanup/orders/${unfinished}`, "DELETE", developer)).status, 409);
    await User.update({ isDeveloper: false }, { where: { id: developerId } }); assert.equal((await request(`/admin/cleanup/orders/${id}`, "DELETE", developer)).status, 403); await User.update({ isDeveloper: true }, { where: { id: developerId } });
    const removed = await request(`/admin/cleanup/orders/${id}`, "DELETE", developer); assert.equal(removed.status, 204, await removed.clone().text()); assert.equal(await Order.findByPk(id), null);
    assert.equal(Number((await InventoryItem.findByPk(inventoryId))!.getDataValue("currentStock")), 8); const movement = await InventoryMovement.findOne({ where: { inventoryItemId: inventoryId } }); assert.ok(movement); assert.equal(movement.getDataValue("orderId"), null); assert.equal(await OrderItem.count({ where: { orderId: id } }), 0); assert.equal(await DeletionLog.count({ where: { entityId: id, userId: developerId } }), 1);
    await DiningTable.create({ id: tableId, number: 2000000 + Math.floor(Math.random() * 1000000), accessKey: randomBytes(32).toString("hex") });
    const session = await DiningSession.create({ tableId, closedAt: new Date(), total: 40 }); const sessionId = String(session.getDataValue("id")); sessions.push(sessionId);
    await createOrder("COMPLETED", { diningSessionId: sessionId }); await createOrder("CANCELED", { diningSessionId: sessionId });
    assert.equal((await request(`/admin/cleanup/sessions/${sessionId}`, "DELETE", admin)).status, 403);
    assert.equal((await request(`/admin/cleanup/sessions/${sessionId}`, "DELETE", developer)).status, 204); assert.equal(await DiningSession.findByPk(sessionId), null); assert.equal(await Order.count({ where: { diningSessionId: sessionId } }), 0); assert.ok(await DiningTable.findByPk(tableId));
    const openSession = await DiningSession.create({ tableId }); const openId = String(openSession.getDataValue("id")); sessions.push(openId); await DiningTable.update({ sessionId: openId }, { where: { id: tableId } });
    assert.equal((await request(`/admin/cleanup/sessions/${openId}`, "DELETE", developer)).status, 409);
    const liveOrder = await createOrder("COMPLETED", { diningSessionId: openId }); assert.equal((await request(`/admin/cleanup/orders/${liveOrder.getDataValue("id")}`, "DELETE", developer)).status, 204);
  } finally {
    await InventoryMovement.destroy({ where: { inventoryItemId: inventoryId } }); await InventoryItem.destroy({ where: { id: inventoryId } });
    for (const id of orderIds) { const items = await OrderItem.findAll({ where: { orderId: id } }); await OrderItemOption.destroy({ where: { orderItemId: { [Op.in]: items.map(item => item.getDataValue("id")) } } }); await OrderItem.destroy({ where: { orderId: id } }); await OrderStatusHistory.destroy({ where: { orderId: id } }); await OrderEdit.destroy({ where: { orderId: id } }); await Order.destroy({ where: { id } }); }
    await DiningSession.destroy({ where: { tableId } }); await DiningTable.destroy({ where: { id: tableId } }); await DeletionLog.destroy({ where: { userId: developerId } });
    await CustomerRecord.destroy({ where: { originalPhone: phoneA } }); await CustomerAccount.destroy({ where: { id: accountId } }); await Product.destroy({ where: { id: productId } }); await Category.destroy({ where: { id: categoryId } }); await User.destroy({ where: { id: { [Op.in]: [developerId, adminId, operatorId, kitchenId] } } });
    await new Promise<void>(resolve => server.close(() => resolve())); await sequelize.close();
  }
});
