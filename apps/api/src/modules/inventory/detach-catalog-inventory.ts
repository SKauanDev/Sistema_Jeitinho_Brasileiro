import { Op } from "sequelize";
import {
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  Product,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";

// One-time, repeatable transition: preserve managed stock and its ledger.
export async function detachCatalogInventory(itemIds?: string[]) {
  return sequelize.transaction(async (transaction) => {
    const linked = await InventoryItem.findAll({
      where: {
        productId: { [Op.ne]: null },
        ...(itemIds ? { id: { [Op.in]: itemIds } } : {}),
      },
      order: [["id", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!linked.length)
      return { detached: 0, archived: 0, categoriesHidden: 0 };
    const movements = await InventoryMovement.findAll({
      attributes: ["inventoryItemId"],
      group: ["inventoryItemId"],
      where: {
        inventoryItemId: {
          [Op.in]: linked.map((item) => item.getDataValue("id")),
        },
      },
      transaction,
    });
    const moved = new Set(
      movements.map((row) => String(row.getDataValue("inventoryItemId"))),
    );
    const products = await Product.findAll({
      attributes: ["id", "name"],
      where: {
        id: { [Op.in]: linked.map((item) => item.getDataValue("productId")) },
      },
      transaction,
    });
    const names = new Map(
      products.map((product) => [
        String(product.getDataValue("id")),
        String(product.getDataValue("name")),
      ]),
    );
    const categories = new Set<string>();
    let archived = 0,
      categoriesHidden = 0;
    for (const item of linked) {
      const unused =
        !item.getDataValue("removedAt") &&
        !moved.has(String(item.getDataValue("id"))) &&
        ["currentStock", "minimumStock", "unitCost"].every(
          (key) => Number(item.getDataValue(key)) === 0,
        ) &&
        item.getDataValue("name") ===
          names.get(String(item.getDataValue("productId")));
      const category = item.getDataValue("category");
      if (category) categories.add(String(category));
      await item.update(
        {
          productId: null,
          ...(unused ? { active: false, removedAt: new Date() } : {}),
        },
        { transaction },
      );
      if (unused) archived++;
    }
    for (const name of categories) {
      // A category with any manually retained item is preserved.
      if (
        await InventoryItem.count({
          where: { category: name, removedAt: null },
          transaction,
        })
      )
        continue;
      const [count] = await InventoryCategory.update(
        { active: false },
        { where: { name, active: true }, transaction },
      );
      categoriesHidden += count;
    }
    return { detached: linked.length, archived, categoriesHidden };
  });
}
