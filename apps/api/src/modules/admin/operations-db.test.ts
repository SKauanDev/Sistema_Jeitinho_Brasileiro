import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import { Category, Courier, DiningSession, DiningTable, InventoryItem, InventoryMovement, Order, OrderEdit, OrderItem, OrderItemOption, OrderStatusHistory, Product, StoreSetting, User } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";
import { getStoreSetting } from "../settings/store-operation.service.js";
import { createOrderRouter } from "../orders/order.routes.js";
import { adminRouter } from "./admin.routes.js";
import { orderEditRouter } from "./order-edit.routes.js";
import { courierRouter } from "../settings/courier.routes.js";
import { issueDiningAccess } from "../dining/dining-access.js";

test("MySQL: ingredientes e preço fixo; Online manual; correções auditadas, estoque e comanda fechada", { skip: process.env.RUN_DB_OPERATIONS_TESTS !== "true", timeout: 60000 }, async () => {
  const categoryId = randomUUID(), productId = randomUUID(), inventoryId = randomUUID(), tableId = randomUUID(), kitchenId = randomUUID(), key = randomBytes(32).toString("hex"), phone = `329${String(Date.now()).slice(-8)}`;
  const number = 1000000 + Math.floor(Math.random() * 1000000);
  const base = await getStoreSetting();
  const settings = StoreSetting.build({ ...base.get({ plain: true }), tableCount: number, autoAcceptOrders: false, allowPickup: true, allowDelivery: true, cashEnabled: true, cardOnDeliveryEnabled: true, onlinePaymentEnabled: true, pixEnabled: true, fixedDeliveryFee: 5, city: "Cidade QA", state: "MG", minimumOrder: 0 });
  const app = express(); app.use(express.json()); app.use("/orders", createOrderRouter({ settings: async () => settings, isOpen: async () => true })); app.use("/admin/order-edits", orderEditRouter); app.use("/admin/couriers", courierRouter); app.use("/admin", adminRouter);
  const events: string[] = []; app.set("io", { to: () => ({ emit: (name: string) => events.push(name) }) });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const send = (path: string, body?: unknown, token?: string, method = "POST", tableToken?: string) => fetch(url + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tableToken ? { "X-Table-Access": tableToken } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let courierId: string | undefined;
  const ids: string[] = [];
  try {
    await Category.create({ id: categoryId, name: "Sanduíches QA operações", slug: categoryId, active: true });
    await Product.create({ id: productId, categoryId, name: "Sanduíche QA operações", price: 25, pizzaSlots: 0, ingredients: ["Pão", "Carne", "Queijo", "Alface"], active: true });
    await InventoryItem.create({ id: inventoryId, productId, name: "Estoque QA operações", unit: "un", currentStock: 10, minimumStock: 0, unitCost: 1, active: true });
    const admin = await User.findOne({ where: { role: "ADMIN", active: true } }); assert.ok(admin);
    const token = jwt.sign({ sub: admin.getDataValue("id"), role: "ADMIN" }, env.jwtSecret, { expiresIn: "5m" });
    await User.create({ id: kitchenId, name: "QA cozinha operações", username: kitchenId, email: `${kitchenId}@example.invalid`, passwordHash: "QA-only", role: "KITCHEN", active: true });
    const kitchen = jwt.sign({ sub: kitchenId, role: "KITCHEN" }, env.jwtSecret, { expiresIn: "5m" });
    assert.equal((await send("/admin/couriers", { name: "QA" })).status, 401);
    assert.equal((await send("/admin/couriers", { name: "QA" }, kitchen)).status, 403);
    const rider = await send("/admin/couriers", { name: `Motoboy QA ${categoryId}`, phone: "32900000000" }, token); assert.equal(rider.status, 201); courierId = (await rider.json()).id;
    const item = { productId, quantity: 2, unitPrice: .01, ingredients: ["Pão", "Carne"], options: [{ name: "Queijo falso", group: "Ingredientes", price: 999 }] };
    const customer = { customerName: "QA operações", customerPhone: phone, fulfillmentType: "PICKUP", paymentMethod: "CASH", items: [item] };
    const created = await send("/orders", customer); assert.equal(created.status, 201, await created.clone().text()); const cashId = (await created.json()).id; ids.push(cashId);
    const read = async (id: string) => (await Order.findByPk(id, { include: [{ model: OrderItem, as: "items", include: [{ model: OrderItemOption, as: "selectedOptions" }] }] }))!.get({ plain: true }) as any;
    const stock = async () => Number((await InventoryItem.findByPk(inventoryId))!.getDataValue("currentStock"));
    let current = await read(cashId); assert.equal(Number(current.subtotal), 50); assert.equal(await stock(), 8); assert.deepEqual(current.items[0].selectedOptions.map((option: any) => option.optionName).sort(), ["Carne", "Pão"]);
    assert.equal((await send("/orders", { ...customer, items: [{ ...item, ingredients: ["Inválido"] }] })).status, 400);
    assert.equal((await send("/orders", { ...customer, paymentMethod: "ONLINE" })).status,403);
    assert.equal((await send("/orders", { ...customer, paymentMethod: "RECEIVED_ONLINE" })).status,403);
    const incomplete = await send("/orders", { ...customer, customerName: "", customerPhone: "" }); assert.equal(incomplete.status,400); assert.deepEqual((await incomplete.json()).missingFields,["nome do cliente","telefone"]);
    const online = await send("/orders", { ...customer, manual: true, paymentMethod: "ONLINE", items: [{ ...item, quantity: 1 }] }, token); assert.equal(online.status, 201);
    const onlineEvent = await online.json(); ids.push(onlineEvent.id); assert.equal(onlineEvent.paymentPath, null); const pending = await read(onlineEvent.id); assert.equal(pending.paymentProvider, "MANUAL"); assert.equal(pending.paymentStatus, "PENDING"); assert.equal(pending.paymentExpiresAt, null); assert.equal(await stock(), 8); assert.ok(events.includes("order:new"));
    const draft = (order: any) => ({ ...order, deliveryFee: Number(order.deliveryFee), discountAmount: Number(order.discountAmount), digitalSecurityFee: Number(order.digitalSecurityFee), changeFor: null, serviceFeeAccepted: !!order.serviceFeeAccepted, reason: "Correção QA de fechamento", items: order.items.map((line: any) => ({ ...line, unitPrice: Number(line.unitPrice), options: line.selectedOptions.map((option: any) => ({ ...option, priceDelta: Number(option.priceDelta) })) })) });
    const edit = async (order: any, changes: any) => { const response = await send(`/admin/order-edits/${order.id}`, { ...draft(order), ...changes }, token, "PATCH"); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
    assert.equal((await send(`/admin/order-edits/${cashId}`, draft(current), kitchen, "PATCH")).status, 403);
    const stale = draft(current);
    current = await edit(current, { fulfillmentType: "DELIVERY", courierId, deliveryFee: 6.5, status: "COMPLETED", paymentStatus: "APPROVED", items: [{ ...draft(current).items[0], quantity: 3 }] }); assert.equal(await stock(), 7); assert.equal(Number(current.total), 82.49); assert.ok(current.courierName);
    assert.equal((await send(`/admin/order-edits/${cashId}`, stale, token, "PATCH")).status, 409); assert.equal(await stock(), 7);
    current = await edit(current, { items: [{ ...draft(current).items[0], quantity: 1 }] }); assert.equal(await stock(), 9);
    current = await edit(current, { status: "CANCELED" }); assert.equal(await stock(), 10);
    current = await edit(current, { status: "COMPLETED", items: [{ ...draft(current).items[0], quantity: 2 }] }); assert.equal(await stock(), 8);
    const received = await edit(pending, { paymentStatus: "APPROVED" }); assert.equal(await stock(), 7); assert.ok(received.paidAt);
    await edit(received, { status: "CANCELED" }); assert.equal(await stock(), 8);
    assert.equal(await OrderEdit.count({ where: { orderId: cashId } }), 4);
    await DiningTable.create({ id: tableId, number, accessKey: key }); const session = await DiningSession.create({ tableId }); const sessionId = session.getDataValue("id"); await DiningTable.update({ sessionId }, { where: { id: tableId } });
    const tableOrder = await send("/orders", { table: { key, sessionId }, serviceFeeAccepted: true, items: [{ ...item, quantity: 1, ingredients: [] }] }, undefined, "POST", issueDiningAccess(key, sessionId)); assert.equal(tableOrder.status, 201, await tableOrder.clone().text()); const tableOrderId = (await tableOrder.json()).id; ids.push(tableOrderId); const dining = await read(tableOrderId); assert.equal(Number(dining.serviceFee), 2.5); assert.equal(Number(dining.total), 27.5);
    await session.update({ closedAt: new Date(), total: 27.5 }); await DiningTable.update({ sessionId: null }, { where: { id: tableId } });
    const corrected = await edit(dining, { items: [{ ...draft(dining).items[0], quantity: 2 }], paymentStatus: "APPROVED" }); assert.equal(Number(corrected.total), 55); await session.reload(); assert.equal(Number(session.getDataValue("total")), 55); assert.equal(await stock(), 6);
    const noService = await edit(corrected, { serviceFeeAccepted: false }); assert.equal(Number(noService.total), 50); await session.reload(); assert.equal(Number(session.getDataValue("total")), 50); assert.equal(await stock(), 6);
    const card = await send("/orders", { ...customer, paymentMethod: "CREDIT_CARD", items: [{ ...item, quantity: 1 }] });
    assert.equal(card.status, 201, await card.clone().text()); const cardEvent = await card.json(); ids.push(cardEvent.id);
    assert.equal(cardEvent.paymentPath, null); const terminal = await read(cardEvent.id); assert.equal(terminal.paymentStatus, "NOT_REQUIRED"); assert.equal(terminal.paymentProvider, "MANUAL"); assert.equal(terminal.paymentExpiresAt, null); assert.equal(await stock(), 5);
    const manualReceived = await send("/orders", { ...customer, manual: true, paymentMethod: "RECEIVED_ONLINE", items: [{ ...item, quantity: 1 }] }, token);
    assert.equal(manualReceived.status,201,await manualReceived.clone().text());
    const manualId = (await manualReceived.json()).id; ids.push(manualId);
    const paid = await read(manualId); assert.equal(paid.paymentStatus,"APPROVED"); assert.ok(paid.paidAt);
    for (const paymentMethod of ["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD"]) {
      const delivery = await send("/orders", { ...customer, fulfillmentType: "DELIVERY", paymentMethod, address: { street: "Rua QA", number: "123", neighborhood: "Bairro QA", city: "Cidade QA", state: "MG", postalCode: "36000000" }, items: [{ ...item, quantity: 1 }] });
      assert.equal(delivery.status,201,await delivery.clone().text()); const deliveryId = (await delivery.json()).id; ids.push(deliveryId);
      const delivered = await read(deliveryId); assert.equal(delivered.customerName,customer.customerName); assert.equal(delivered.number,"123"); assert.equal(Number(delivered.deliveryFee),5); assert.equal(delivered.paymentStatus,"NOT_REQUIRED"); assert.equal(delivered.paidAt,null); assert.equal(delivered.paymentExpiresAt,null); assert.equal(delivered.paymentExternalId,null); assert.equal(delivered.paymentCheckoutUrl,null); assert.equal(delivered.pixCopyPaste,null); assert.equal(delivered.customerDocument,null); assert.equal(delivered.customerEmail,null);
      if (paymentMethod === "PIX") {
        await Order.update({paymentStatus:"PENDING"},{where:{id:deliveryId}});
        const advance = await send(`/admin/orders/${deliveryId}/status`,{status:"CONFIRMED"},token,"PATCH"); assert.equal(advance.status,200,await advance.clone().text());
        const advanced = await read(deliveryId); assert.equal(advanced.paymentStatus,"NOT_REQUIRED"); assert.equal(advanced.paidAt,null); assert.equal(advanced.status,"CONFIRMED");
      }

    }
  } finally {
    await OrderEdit.destroy({ where: { orderId: { [Op.in]: ids } } });
    await InventoryMovement.destroy({ where: { inventoryItemId: inventoryId } }); await InventoryItem.destroy({ where: { id: inventoryId } });
    for (const id of ids) { for (const item of await OrderItem.findAll({ where: { orderId: id } })) await OrderItemOption.destroy({ where: { orderItemId: item.getDataValue("id") } }); await OrderItem.destroy({ where: { orderId: id } }); await OrderStatusHistory.destroy({ where: { orderId: id } }); await Order.destroy({ where: { id } }); }
    await DiningSession.destroy({ where: { tableId } }); await DiningTable.destroy({ where: { id: tableId } }); if (courierId) await Courier.destroy({ where: { id: courierId } });
    await Product.destroy({ where: { id: productId } }); await Category.destroy({ where: { id: categoryId } }); await User.destroy({ where: { id: kitchenId } });
    await new Promise<void>(resolve => server.close(() => resolve())); await sequelize.close();
  }
});
