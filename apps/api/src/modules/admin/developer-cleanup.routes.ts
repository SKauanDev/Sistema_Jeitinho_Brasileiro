import { Router } from "express";
import { Op, type Transaction } from "sequelize";
import { DeletionLog, DiningSession, DiningTable, InventoryMovement, Order, OrderItem, OrderItemOption, OrderStatusHistory } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { requireAuth } from "../../shared/auth.middleware.js";
import { requireDeveloper } from "../../shared/developer.middleware.js";
import { ADMIN_ROOM } from "../../realtime/socket-security.js";

async function removeOrder(id: string, userId: string, transaction: Transaction) {
  const initial = await Order.findByPk(id, { transaction });
  if (!initial) throw Error("Pedido não encontrado.");
  const sessionId = initial.getDataValue("diningSessionId");
  const session = sessionId ? await DiningSession.findByPk(sessionId, { transaction }) : null;
  if (session) {
    await DiningTable.findByPk(session.getDataValue("tableId"), { transaction, lock: transaction.LOCK.UPDATE });
    await session.reload({ transaction, lock: transaction.LOCK.UPDATE });
  }
  const order = await Order.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!order || order.getDataValue("diningSessionId") !== sessionId) throw Error("O pedido mudou. Atualize a página.");
  const status = String(order.getDataValue("status"));
  if (!["COMPLETED", "CANCELED"].includes(status)) throw Error("Somente pedidos concluídos ou cancelados podem ser excluídos.");
  const reference = String(order.getDataValue("displayNumber"));
  await DeletionLog.create({ entityType: "ORDER", entityId: id, userId, reference, snapshot: { status, total: order.getDataValue("total"), diningSessionId: sessionId } }, { transaction });
  const items = await OrderItem.findAll({ where: { orderId: id }, attributes: ["id"], transaction });
  await OrderItemOption.destroy({ where: { orderItemId: { [Op.in]: items.map(item => item.getDataValue("id")) } }, transaction });
  await OrderItem.destroy({ where: { orderId: id }, transaction });
  await OrderStatusHistory.destroy({ where: { orderId: id }, transaction });
  // Sales/cancellation stock movements remain in the ledger. Deleting a receipt
  // must never return sold products to stock or erase previous stock history.
  await InventoryMovement.update({ orderId: null }, { where: { orderId: id }, transaction });
  await order.destroy({ transaction });
  if (session?.getDataValue("closedAt")) {
    const remaining = await Order.findAll({ where: { diningSessionId: sessionId, status: { [Op.ne]: "CANCELED" } }, attributes: ["total"], transaction });
    await session.update({ total: Math.round(remaining.reduce((sum, item) => sum + Number(item.getDataValue("total")), 0) * 100) / 100 }, { transaction });
  }
}
export const developerCleanupRouter = Router();
developerCleanupRouter.use(requireAuth, requireDeveloper);
developerCleanupRouter.get("/sessions", async (_req, res) => {
  const sessions = await DiningSession.findAll({ where: { closedAt: { [Op.ne]: null } }, order: [["closedAt", "DESC"]], limit: 200 });
  const tables = await DiningTable.findAll({ attributes: ["id", "number"] });
  const orders = await Order.findAll({ where: { diningSessionId: { [Op.in]: sessions.map(session => session.getDataValue("id")) } }, attributes: ["diningSessionId", "status"] });
  res.json(sessions.map(session => ({ id: session.getDataValue("id"), closedAt: session.getDataValue("closedAt"), total: session.getDataValue("total"), tableNumber: tables.find(table => table.getDataValue("id") === session.getDataValue("tableId"))?.getDataValue("number"),
    ordersCount: orders.filter(order => order.getDataValue("diningSessionId") === session.getDataValue("id")).length,
    canDelete: !orders.some(order => order.getDataValue("diningSessionId") === session.getDataValue("id") && !["COMPLETED", "CANCELED"].includes(String(order.getDataValue("status")))) })));
});
developerCleanupRouter.delete("/orders/:id", async (req, res) => {
  try {
    await sequelize.transaction(transaction => removeOrder(String(req.params.id), String(res.locals.user.sub), transaction));
    req.app.get("io")?.to(ADMIN_ROOM).emit("order:updated", { id: req.params.id, deleted: true });
    res.status(204).end();
  } catch (error) { res.status(409).json({ message: (error as Error).message }); }
});
developerCleanupRouter.delete("/sessions/:id", async (req, res) => {
  try {
    await sequelize.transaction(async transaction => {
      const found = await DiningSession.findByPk(String(req.params.id), { transaction });
      if (!found) throw Error("Comanda não encontrada.");
      const table = await DiningTable.findByPk(found.getDataValue("tableId"), { transaction, lock: transaction.LOCK.UPDATE });
      await found.reload({ transaction, lock: transaction.LOCK.UPDATE });
      if (!found.getDataValue("closedAt") || table?.getDataValue("sessionId") === found.getDataValue("id")) throw Error("Somente comandas encerradas podem ser excluídas.");
      const orders = await Order.findAll({ where: { diningSessionId: found.getDataValue("id") }, attributes: ["id", "status"], transaction });
      if (orders.some(order => !["COMPLETED", "CANCELED"].includes(String(order.getDataValue("status"))))) throw Error("Conclua ou cancele os pedidos desta comanda antes de excluí-la.");
      const userId = String(res.locals.user.sub);
      await DeletionLog.create({ entityType: "DINING_SESSION", entityId: found.getDataValue("id"), userId, reference: `Mesa ${table?.getDataValue("number")}`, snapshot: { total: found.getDataValue("total"), closedAt: found.getDataValue("closedAt") } }, { transaction });
      for (const order of orders) await removeOrder(String(order.getDataValue("id")), userId, transaction);
      await found.destroy({ transaction });
    });
    req.app.get("io")?.to(ADMIN_ROOM).emit("order:updated", { deleted: true }); res.status(204).end();
  } catch (error) { res.status(409).json({ message: (error as Error).message }); }
});
