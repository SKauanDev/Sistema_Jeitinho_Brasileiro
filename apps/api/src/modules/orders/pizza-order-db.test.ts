import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { Category, Order, OrderItem, OrderItemOption, OrderStatusHistory, Product } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { orderRouter } from "./order.routes.js";

test("MySQL/HTTP: tamanho determina o preço; pedido guarda tamanho e sabores; metades iguais são rejeitadas", { skip: process.env.RUN_DB_PIZZA_TESTS !== "true" }, async () => {
  const categoryId = randomUUID(), firstId = randomUUID(), secondId = randomUUID();
  const phone = `329${String(Date.now()).slice(-8)}`;
  const app = express(); app.use(express.json()); app.use("/orders", orderRouter);
  const server = app.listen(0, "127.0.0.1");
  if (!server.listening) await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/orders`;
  try {
    await Category.create({ id: categoryId, name: "Pizzas QA pedido", slug: `qa-${categoryId}`, active: true });
    await Product.create({ id: firstId, categoryId, name: "Pizza QA A", price: 10, pizzaSlots: 1, sizes: [{ size: "G", price: 160 }], active: true });
    await Product.create({ id: secondId, categoryId, name: "Pizza QA B", price: 10, pizzaSlots: 1, sizes: [{ size: "G", price: 175 }], active: true });
    const item = { productId: firstId, productName: "Nome adulterado", unitPrice: .01, quantity: 2, size: "G", pizzaSelections: [{ mode: "half", leftId: firstId, rightId: secondId }], options: [{ name: "P", group: "Tamanho", price: 0 }, { name: "Sabor falso", group: "Pizza 1 · sabor inteiro", price: 0 }] };
    const send = (changed: Record<string, unknown>) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: "QA tamanho temporário", customerPhone: phone, fulfillmentType: "PICKUP", paymentMethod: "CASH", items: [{ ...item, ...changed }] }) });
    for (const changed of [{ size: undefined }, { size: "GG" }, { pizzaSelections: [{ mode: "half", leftId: firstId, rightId: firstId }] }]) {
      const invalid = await send(changed);
      assert.equal(invalid.status, 400, await invalid.text());
      assert.equal(await Order.count({ where: { customerPhone: phone } }), 0);
    }
    const response = await send({});
    const data = await response.json();
    assert.equal(response.status, 201, JSON.stringify(data));
    const order = await Order.findByPk(data.id); assert.ok(order);
    assert.equal(Number(order.getDataValue("subtotal")), 350);
    const storedItem = await OrderItem.findOne({ where: { orderId: data.id } }); assert.ok(storedItem);
    assert.equal(Number(storedItem.getDataValue("unitPrice")), 175);
    assert.equal(storedItem.getDataValue("productName"), "Pizza QA A");
    const options = await OrderItemOption.findAll({ where: { orderItemId: storedItem.getDataValue("id") } });
    assert.deepEqual(options.map(option => option.getDataValue("optionName")).sort(), ["G", "Pizza QA A", "Pizza QA B"].sort());
  } finally {
    for (const order of await Order.findAll({ where: { customerPhone: phone } })) {
      const orderId = order.getDataValue("id");
      for (const item of await OrderItem.findAll({ where: { orderId } })) await OrderItemOption.destroy({ where: { orderItemId: item.getDataValue("id") } });
      await OrderItem.destroy({ where: { orderId } });
      await OrderStatusHistory.destroy({ where: { orderId } });
      await order.destroy();
    }
    await Product.destroy({ where: { categoryId } });
    await Category.destroy({ where: { id: categoryId } });
    await new Promise<void>(resolve => server.close(() => resolve()));
    await sequelize.close();
  }
});
