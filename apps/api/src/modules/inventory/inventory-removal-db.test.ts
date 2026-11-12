import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { Category, Product, InventoryItem, InventoryMovement, InventoryCategory, User } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";
import { inventoryRouter } from "./inventory.routes.js";

test("MySQL/HTTP: exclui item manual e vinculado sem ressuscitar no sync; preserva movimentações e reativação automática legítima", { skip: process.env.RUN_DB_INVENTORY_REMOVAL_TESTS !== "true", timeout: 60000 }, async () => {
  const suffix = randomUUID(), categoryId = randomUUID(), firstId = randomUUID(), secondId = randomUUID(), categoryName = `Bebidas QA exclusão ${suffix}`;
  const ids: string[] = [];
  const app = express(); app.use(express.json()); app.use("/inventory", inventoryRouter);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const admin = await User.findOne({ where: { role: "ADMIN", active: true } }); assert.ok(admin);
  const token = jwt.sign({ sub: admin.getDataValue("id"), role: "ADMIN" }, env.jwtSecret, { expiresIn: "3m" });
  const request = (path: string, method = "GET", body?: unknown, authenticated = true) => fetch(`http://127.0.0.1:${address.port}/inventory${path}`, { method, headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const list = async () => { const response = await request("/"); assert.equal(response.status, 200); return response.json(); };
  try {
    await Category.create({ id: categoryId, name: categoryName, slug: `qa-${suffix}`, active: true });
    await Product.bulkCreate([{ id: firstId, categoryId, name: `Bebida QA ${suffix}`, price: 10, active: true }, { id: secondId, categoryId, name: `Bebida QA automática ${suffix}`, price: 10, active: true }]);
    await list();
    const linked = await InventoryItem.findOne({ where: { productId: firstId } });
    const automatic = await InventoryItem.findOne({ where: { productId: secondId } }); assert.ok(linked && automatic);
    ids.push(String(linked.getDataValue("id")), String(automatic.getDataValue("id")));
    const manualResponse = await request("/items", "POST", { name: `Insumo QA ${suffix}`, category: "Insumos", unit: "un", currentStock: 5, minimumStock: 1, unitCost: 2 });
    assert.equal(manualResponse.status, 201); const manual = await manualResponse.json(); ids.push(manual.id);
    assert.equal((await request(`/items/${linked.getDataValue("id")}`, "DELETE", undefined, false)).status, 401);
    const movement = await request(`/items/${linked.getDataValue("id")}/movements`, "POST", { type: "ADJUST", quantity: 7, reason: "QA temporário" }); assert.equal(movement.status, 201);
    for (const id of [manual.id, String(linked.getDataValue("id"))]) {
      const before = await InventoryMovement.count({ where: { inventoryItemId: id } });
      const deleted = await request(`/items/${id}`, "DELETE"); assert.equal(deleted.status, 204); assert.equal(await deleted.text(), "");
      for (let n = 0; n < 2; n++) assert.equal((await list()).items.some((item: any) => item.id === id), false);
      const stored = await InventoryItem.findByPk(id); assert.ok(stored); assert.ok(stored.getDataValue("removedAt")); assert.equal(stored.getDataValue("active"), false);
      assert.equal(await InventoryMovement.count({ where: { inventoryItemId: id } }), before);
      assert.equal((await request(`/items/${id}`, "PATCH", { active: true })).status, 404);
      assert.equal((await request(`/items/${id}/movements`, "POST", { type: "IN", quantity: 1, reason: "QA" })).status, 404);
      assert.equal((await request(`/items/${id}`, "DELETE")).status, 404);
    }
    await Product.update({ name: `Bebida QA renomeada ${suffix}` }, { where: { id: firstId } }); await list(); await linked.reload(); assert.equal(linked.getDataValue("active"), false); assert.ok(linked.getDataValue("removedAt"));
    const history = await request(`/movements?itemId=${linked.getDataValue("id")}`); assert.equal(history.status, 200); assert.equal((await history.json()).length, 1);
    await Product.update({ active: false }, { where: { id: secondId } }); await list(); await automatic.reload(); assert.equal(automatic.getDataValue("active"), false);
    await Product.update({ active: true }, { where: { id: secondId } }); await list(); await automatic.reload(); assert.equal(automatic.getDataValue("active"), true); assert.equal(automatic.getDataValue("removedAt"), null);
  } finally {
    for (const item of await InventoryItem.findAll({ where: { productId: [firstId, secondId] } })) if (!ids.includes(String(item.getDataValue("id")))) ids.push(String(item.getDataValue("id")));
    for (const id of ids) { await InventoryMovement.destroy({ where: { inventoryItemId: id } }); await InventoryItem.destroy({ where: { id } }); }
    await Product.destroy({ where: { categoryId } }); await Category.destroy({ where: { id: categoryId } }); await InventoryCategory.destroy({ where: { name: categoryName } });
    await new Promise<void>(resolve => server.close(() => resolve())); await sequelize.close();
  }
});
