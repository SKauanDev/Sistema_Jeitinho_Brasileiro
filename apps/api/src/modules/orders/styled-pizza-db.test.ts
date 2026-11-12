import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { Category, Order, OrderItem, OrderItemOption, OrderStatusHistory, Product, StoreSetting } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { getStoreSetting } from "../settings/store-operation.service.js";
import { emptyPizzaRules } from "../catalog/pizza-rules.js";
import { initialStyleMenus } from "../catalog/pizza-style-menu.js";
import { createOrderRouter } from "./order.routes.js";

test("MySQL/HTTP: preço por massa e borda é calculado no servidor; pedido guarda estilo, tamanho e recheio", { skip: process.env.RUN_DB_STYLE_TESTS !== "true", timeout: 30000 }, async () => {
  const categoryId = randomUUID(), productId = randomUUID(), borderId = randomUUID(), phone = `329${String(Date.now()).slice(-8)}`;
  const base = await getStoreSetting();
  const sweetBorderId = randomUUID();
  const borders = [{ id: borderId, name: "Recheio QA temporário", type: "SAVORY" as const, price: .01, active: true }, { id: sweetBorderId, name: "Recheio doce QA temporário", type: "SWEET" as const, price: .01, active: true }];
  const setting = StoreSetting.build({ ...base.get({ plain: true }), allowPickup: true, cashEnabled: true, minimumOrder: 0, pizzaRules: { ...emptyPizzaRules(), borders, menus: initialStyleMenus(borders) } });
  const app = express(); app.use(express.json()); app.use("/orders", createOrderRouter({ isOpen: async () => true, settings: async () => setting }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/orders`;
  const send = (item: object) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: "QA estilos", customerPhone: phone, fulfillmentType: "PICKUP", paymentMethod: "CASH", items: [item] }) });
  try {
    await Category.create({ id: categoryId, name: "Pizzas QA estilos", slug: `qa-${categoryId}`, active: true });
    await Product.create({ id: productId, categoryId, name: "Pizza QA estilos", price: .01, promotionalPrice: .01, sizes: null, pizzaSlots: 1, active: true });
    const item = { productId, quantity: 2, unitPrice: .01, style: "NAPOLITANA", size: "P", pizzaSelections: [{ mode: "whole", leftId: productId, borderId }], options: [{ group: "Estilo da massa", name: "Estilo adulterado", price: .01 }] };
    for (const invalid of [{ ...item, style: undefined }, { ...item, style: "TONDA_ROMANA" }, { ...item, style: "TONDA_ROMANA", size: "GG" }]) assert.equal((await send(invalid)).status, 400);
    assert.equal(await Order.count({ where: { customerPhone: phone } }), 0);
    const created = await send(item); assert.equal(created.status, 201, await created.clone().text());
    const order = await Order.findByPk((await created.json()).id); assert.ok(order);
    assert.equal(Number(order.getDataValue("subtotal")), 95.8); assert.equal(Number(order.getDataValue("total")), 96.79);
    const storedItem = await OrderItem.findOne({ where: { orderId: order.getDataValue("id") } }); assert.ok(storedItem);
    assert.equal(Number(storedItem.getDataValue("unitPrice")), 32.9); assert.equal(Number(storedItem.getDataValue("optionsTotal")), 15);
    const options = await OrderItemOption.findAll({ where: { orderItemId: storedItem.getDataValue("id") } });
    assert.equal(options.filter(option => option.getDataValue("optionGroupName") === "Estilo da massa").length, 1);
    assert.ok(options.some(option => option.getDataValue("optionName") === "Napolitana"));
    assert.ok(options.some(option => option.getDataValue("optionName") === "Recheio QA temporário" && Number(option.getDataValue("priceDelta")) === 15));
    const dessertBorder = await send({ ...item, pizzaSelections: [{ mode: "whole", leftId: productId, borderId: sweetBorderId }] });
    assert.equal(dessertBorder.status, 201);
    const dessertOrder = await Order.findByPk((await dessertBorder.json()).id); assert.ok(dessertOrder);
    assert.equal(Number(dessertOrder.getDataValue("subtotal")), 101.8);
    const dessertItem = await OrderItem.findOne({ where: { orderId: dessertOrder.getDataValue("id") } }); assert.ok(dessertItem);
    assert.equal(Number(dessertItem.getDataValue("optionsTotal")), 18);
    const tonda = await send({ ...item, style: "TONDA_ROMANA", size: "M", pizzaSelections: [{ mode: "whole", leftId: productId }] }); assert.equal(tonda.status, 201);
    const roman = await Order.findByPk((await tonda.json()).id); assert.equal(Number(roman!.getDataValue("subtotal")), 100);
  } finally {
    for (const order of await Order.findAll({ where: { customerPhone: phone } })) {
      const orderId = order.getDataValue("id");
      for (const item of await OrderItem.findAll({ where: { orderId } })) await OrderItemOption.destroy({ where: { orderItemId: item.getDataValue("id") } });
      await OrderItem.destroy({ where: { orderId } }); await OrderStatusHistory.destroy({ where: { orderId } }); await order.destroy();
    }
    await Product.destroy({ where: { categoryId } }); await Category.destroy({ where: { id: categoryId } });
    await new Promise<void>(resolve => server.close(() => resolve())); await sequelize.close();
  }
});
