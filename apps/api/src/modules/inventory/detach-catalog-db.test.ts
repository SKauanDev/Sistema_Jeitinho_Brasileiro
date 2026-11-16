import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  Category,
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  Product,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { detachCatalogInventory } from "./detach-catalog-inventory.js";

test(
  "MySQL: remove vínculo e importações sem uso, preservando saldo, histórico e estoque manual",
  { skip: process.env.RUN_DB_DETACH_TESTS !== "true", timeout: 60000 },
  async () => {
    const categoryId = randomUUID(),
      suffix = randomUUID(),
      emptyCategory = `QA catálogo ${suffix}`,
      usedCategory = `QA manual ${suffix}`;
    const productIds = Array.from({ length: 3 }, () => randomUUID()),
      ids = Array.from({ length: 4 }, () => randomUUID());
    try {
      await Category.create({
        id: categoryId,
        name: emptyCategory,
        slug: suffix,
        active: true,
      });
      await InventoryCategory.bulkCreate([
        { name: emptyCategory, active: true },
        { name: usedCategory, active: true },
      ]);
      for (const [index, id] of productIds.entries())
        await Product.create({
          id,
          categoryId,
          name: `QA produto ${index} ${suffix}`,
          price: 10,
          active: true,
        });
      for (const [index, id] of ids.entries())
        await InventoryItem.create({
          id,
          productId: productIds[index] ?? null,
          name:
            index < 3 ? `QA produto ${index} ${suffix}` : `QA insumo ${suffix}`,
          category: index === 0 ? emptyCategory : usedCategory,
          currentStock: index === 1 ? 7 : 0,
          minimumStock: 0,
          unitCost: 0,
          unit: "un",
          active: true,
        });
      await InventoryMovement.create({
        inventoryItemId: ids[2],
        type: "ADJUST",
        quantity: 0,
        previousStock: 0,
        resultingStock: 0,
        reason: "QA histórico preservado",
        createdBy: "QA",
      });
      const result = await detachCatalogInventory(ids);
      assert.equal(result.detached, 3);
      assert.equal(result.archived, 1);
      assert.equal(result.categoriesHidden, 1);
      const archived = await InventoryItem.findByPk(ids[0]);
      assert.ok(archived?.getDataValue("removedAt"));
      for (const id of ids) {
        const item = await InventoryItem.findByPk(id);
        assert.equal(item!.getDataValue("productId"), null);
        if (id !== ids[0]) {
          assert.equal(item!.getDataValue("active"), true);
          assert.equal(item!.getDataValue("removedAt"), null);
        }
      }
      assert.equal(
        Number(
          (await InventoryItem.findByPk(ids[1]))!.getDataValue("currentStock"),
        ),
        7,
      );
      assert.equal(
        await InventoryMovement.count({ where: { inventoryItemId: ids[2] } }),
        1,
      );
      assert.equal(
        (await InventoryCategory.findOne({
          where: { name: emptyCategory },
        }))!.getDataValue("active"),
        false,
      );
      assert.equal(
        (await InventoryCategory.findOne({
          where: { name: usedCategory },
        }))!.getDataValue("active"),
        true,
      );
      assert.deepEqual(await detachCatalogInventory(ids), {
        detached: 0,
        archived: 0,
        categoriesHidden: 0,
      });
      assert.equal(await Product.count({ where: { categoryId } }), 3);
    } finally {
      await InventoryMovement.destroy({ where: { inventoryItemId: ids } });
      await InventoryItem.destroy({ where: { id: ids } });
      await InventoryCategory.destroy({
        where: { name: [emptyCategory, usedCategory] },
      });
      await Product.destroy({ where: { categoryId } });
      await Category.destroy({ where: { id: categoryId } });
      await sequelize.close();
    }
  },
);
