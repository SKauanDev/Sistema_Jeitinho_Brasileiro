import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import {
  InventoryItem,
  InventoryCategory,
  InventoryMovement,
  User,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";
import { inventoryRouter } from "./inventory.routes.js";

test(
  "MySQL: exclusão em lote exige equipe, preserva histórico e não exclui parcialmente uma seleção inválida",
  { skip: process.env.RUN_DB_INVENTORY_BULK_TESTS !== "true", timeout: 60000 },
  async () => {
    const adminId = randomUUID(),
      kitchenId = randomUUID(),
      ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const app = express();
    const categoryNames = [
      `QA origem ${adminId}`,
      `QA destino ${adminId}`,
      `QA vazia ${adminId}`,
    ] as const;
    app.use(express.json());
    app.use("/inventory", inventoryRouter);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const token = (id: string) =>
      jwt.sign(
        { sub: id, role: id === kitchenId ? "KITCHEN" : "ADMIN" },
        env.jwtSecret,
        { expiresIn: "3m" },
      );
    const request = (selected: unknown, auth: string | null = token(adminId)) =>
      fetch(`http://127.0.0.1:${address.port}/inventory/items/bulk-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        body: JSON.stringify({ ids: selected }),
      });
    try {
      await User.bulkCreate([
        {
          id: adminId,
          name: "QA lote estoque",
          username: adminId,
          email: `${adminId}@example.invalid`,
          role: "ADMIN",
          passwordHash: "QA-only",
          active: true,
        },
        {
          id: kitchenId,
          name: "QA cozinha estoque",
          username: kitchenId,
          email: `${kitchenId}@example.invalid`,
          role: "KITCHEN",
          passwordHash: "QA-only",
          active: true,
        },
      ]);
      await InventoryItem.bulkCreate(
        ids.map((id, index) => ({
          id,
          name: `QA lote ${index}`,
          category: "QA",
          unit: "kg",
          currentStock: 5,
          minimumStock: 1,
          unitCost: 2,
          active: true,
        })),
      );
      await InventoryMovement.create({
        inventoryItemId: ids[0],
        type: "IN",
        quantity: 5,
        previousStock: 0,
        resultingStock: 5,
        reason: "QA lote",
      });
      assert.equal((await request(ids, null)).status, 401);
      assert.equal((await request(ids, token(kitchenId))).status, 403);
      for (const invalid of [
        [],
        [ids[0], ids[0]],
        ["invalid"],
        Array.from({ length: 1001 }, () => randomUUID()),
      ])
        assert.equal((await request(invalid)).status, 400);
      assert.equal((await request([ids[0], randomUUID()])).status, 409);
      assert.equal(
        (await InventoryItem.findByPk(ids[0]))?.getDataValue("removedAt"),
        null,
      );
      assert.equal((await request([ids[0], ids[1]])).status, 204);
      for (const id of ids.slice(0, 2)) {
        const item = await InventoryItem.findByPk(id);
        assert.equal(item?.getDataValue("active"), false);
        assert.ok(item?.getDataValue("removedAt"));
        assert.equal(Number(item?.getDataValue("currentStock")), 5);
      }
      assert.equal(
        await InventoryMovement.count({ where: { inventoryItemId: ids[0] } }),
        1,
      );
      assert.equal(
        (await InventoryItem.findByPk(ids[2]))?.getDataValue("active"),
        true,
      );
      assert.equal((await request([ids[0], ids[2]])).status, 409);
      await InventoryCategory.bulkCreate(
        categoryNames.map((name) => ({ name, active: true })),
      );
      await InventoryItem.update(
        { category: categoryNames[0] },
        { where: { id: ids[2] } },
      );
      await InventoryMovement.create({
        inventoryItemId: ids[2],
        type: "IN",
        quantity: 5,
        previousStock: 0,
        resultingStock: 5,
        reason: "QA categoria",
      });
      await InventoryItem.update({ category: categoryNames[0], active: false }, { where: { id: ids[4] } });
      const removeCategory = (name: string, auth = token(adminId)) =>
        fetch(
          `http://127.0.0.1:${address.port}/inventory/categories/${encodeURIComponent(name)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${auth}` } },
        );
      assert.equal(
        (await removeCategory(categoryNames[0], token(kitchenId))).status,
        403,
      );
      assert.equal((await removeCategory(categoryNames[0])).status, 204);
      assert.ok((await InventoryItem.findByPk(ids[4]))?.getDataValue("removedAt"));
      const removedItem = await InventoryItem.findByPk(ids[2]);
      assert.equal(removedItem?.getDataValue("active"), false);
      assert.ok(removedItem?.getDataValue("removedAt"));
      assert.equal(Number(removedItem?.getDataValue("currentStock")), 5);
      assert.equal(
        await InventoryMovement.count({ where: { inventoryItemId: ids[2] } }),
        1,
      );
      assert.equal(
        (
          await InventoryCategory.findOne({ where: { name: categoryNames[0] } })
        )?.getDataValue("active"),
        false,
      );
      assert.equal((await removeCategory(categoryNames[0])).status, 404);
      assert.equal((await removeCategory(categoryNames[2])).status, 204);
      assert.equal(
        (await InventoryItem.findByPk(ids[3]))?.getDataValue("active"),
        true,
      );
      assert.equal(
        (await InventoryItem.findByPk(ids[3]))?.getDataValue("removedAt"),
        null,
      );
    } finally {
      await InventoryCategory.destroy({
        where: { name: { [Op.in]: categoryNames } },
      });
      await InventoryMovement.destroy({
        where: { inventoryItemId: { [Op.in]: ids } },
      });
      await InventoryItem.destroy({ where: { id: { [Op.in]: ids } } });
      await User.destroy({ where: { id: { [Op.in]: [adminId, kitchenId] } } });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await sequelize.close();
    }
  },
);
