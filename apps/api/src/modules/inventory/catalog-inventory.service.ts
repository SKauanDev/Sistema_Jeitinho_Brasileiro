import type { Transaction } from "sequelize";
import { InventoryItem, InventoryMovement, Order, OrderItem } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { QueryTypes } from "sequelize";
import { assertAvailableStock, groupedQuantities } from "./stock-validation.js";

const number = (value: unknown) => Number(value ?? 0);
// Executar na transação READ COMMITTED de criação. Os bloqueios ordenados
// serializam carrinhos concorrentes; pedidos ainda não baixados reservam saldo.
export async function validateOrderInventory(items: Array<{ productId?: unknown; quantity?: unknown }>, transaction: Transaction) {
  const locked = [];
  for (const [productId, requested] of groupedQuantities(items)) {
    const inventory = await InventoryItem.findOne({ where: { productId, active: true, removedAt: null }, transaction, lock: transaction.LOCK.UPDATE });
    if (inventory) locked.push({ productId, requested, inventory });
  }
  for (const { productId, requested, inventory } of locked) {
    const rows = await sequelize.query<{ reserved: string }>(`SELECT COALESCE(SUM(oi.quantity), 0) AS reserved FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = :productId AND o.status <> 'CANCELED' AND o.inventory_processed_at IS NULL`, { replacements: { productId }, transaction, type: QueryTypes.SELECT });
    assertAvailableStock(String(inventory.getDataValue("name")), number(inventory.getDataValue("currentStock")), requested, number(rows[0]?.reserved));
  }
}

export async function applyOrderInventory(orderId: string, outerTransaction?: Transaction) {
  const execute = async (transaction: Transaction) => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order || order.getDataValue("inventoryProcessedAt") || order.getDataValue("status") === "CANCELED") return false;
    const revision = Number(order.getDataValue("inventoryRevision") ?? 0);
    const movementKey = `ORDER:${orderId}${revision ? `:R${revision}` : ""}`;
    const items = await OrderItem.findAll({ where: { orderId }, transaction });
    for (const [productId, requested] of groupedQuantities(items.map(item => ({ productId: item.getDataValue("productId"), quantity: item.getDataValue("quantity") })))) {
      const inventory = await InventoryItem.findOne({ where: { productId, active: true, removedAt: null }, transaction, lock: transaction.LOCK.UPDATE }); if (!inventory) continue;
      const previous = number(inventory.getDataValue("currentStock"));
      assertAvailableStock(String(inventory.getDataValue("name")), previous, requested);
      const deducted = requested;
      const resulting = previous - deducted;
      await inventory.update({ currentStock: resulting }, { transaction });
      if (deducted > 0) await InventoryMovement.findOrCreate({ where: { sourceId: `${movementKey}:${inventory.getDataValue("id")}` }, defaults: { inventoryItemId: inventory.getDataValue("id"), orderId, sourceId: `${movementKey}:${inventory.getDataValue("id")}`, type: "OUT", quantity: deducted, previousStock: previous, resultingStock: resulting, reason: `Venda no pedido #${order.getDataValue("displayNumber")}`, notes: "Baixa automática pelo cardápio", createdBy: "Sistema" }, transaction });
    }
    await order.update({ inventoryProcessedAt: new Date() }, { transaction });
    return true;
  };
  return outerTransaction ? execute(outerTransaction) : sequelize.transaction(execute);
}

export async function revertOrderInventory(orderId: string, outerTransaction?: Transaction) {
  const execute = async (transaction: Transaction) => {
    const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!order?.getDataValue("inventoryProcessedAt") || order.getDataValue("inventoryRevertedAt")) return false;
    const movements = await InventoryMovement.findAll({ where: { orderId }, transaction });
    const balances = new Map<string, number>();
    for (const movement of movements) {
      const id = String(movement.getDataValue("inventoryItemId"));
      balances.set(id, (balances.get(id) ?? 0) + number(movement.getDataValue("quantity")) * (movement.getDataValue("type") === "OUT" ? 1 : -1));
    }
    const revision = Number(order.getDataValue("inventoryRevision") ?? 0);
    const movementKey = `CANCEL:${orderId}${revision ? `:R${revision}` : ""}`;
    for (const [inventoryId, returned] of [...balances].sort(([a], [b]) => a.localeCompare(b))) {
      if (returned <= 0) continue;
      const inventory = await InventoryItem.findByPk(inventoryId, { transaction, lock: transaction.LOCK.UPDATE }); if (!inventory) continue;
      const previous = number(inventory.getDataValue("currentStock")); const resulting = previous + returned;
      await inventory.update({ currentStock: resulting }, { transaction });
      await InventoryMovement.findOrCreate({ where: { sourceId: `${movementKey}:${inventory.getDataValue("id")}` }, defaults: { inventoryItemId: inventory.getDataValue("id"), orderId, sourceId: `${movementKey}:${inventory.getDataValue("id")}`, type: "IN", quantity: returned, previousStock: previous, resultingStock: resulting, reason: `Estorno do pedido #${order.getDataValue("displayNumber")}`, notes: "Entrada automática por cancelamento", createdBy: "Sistema" }, transaction });
    }
    await order.update({ inventoryRevertedAt: new Date() }, { transaction }); return true;
  };
  return outerTransaction ? execute(outerTransaction) : sequelize.transaction(execute);
}
