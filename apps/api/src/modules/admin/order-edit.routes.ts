import { Router } from "express";
import { isCounterPayment } from "../orders/payment-policy.js";
import { Op } from "sequelize";
import { Courier, DiningSession, DiningTable, Order, OrderEdit, OrderItem, OrderItemOption, OrderStatusHistory, Product } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { requireAuth, requireAdmin } from "../../shared/auth.middleware.js";
import { ORDER_STATUSES } from "../orders/order.constants.js";
import { applyOrderInventory, revertOrderInventory } from "../inventory/catalog-inventory.service.js";
import { ADMIN_ROOM } from "../../realtime/socket-security.js";
import { serviceFee } from "../orders/service-fee.js";
import { getStoreSetting } from "../settings/store-operation.service.js";

const include = [{ model: OrderItem, as: "items", include: [{ model: OrderItemOption, as: "selectedOptions" }] }, { model: OrderStatusHistory, as: "statusHistory" }];
const money = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 9999999 || Math.abs(value * 100 - Math.round(value * 100)) > .0001) throw Error("Valor monetário inválido.");
  return Math.round(value * 100) / 100;
};
const text = (value: unknown, max: number, required = false) => {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw Error("Preencha os campos obrigatórios e respeite seus limites.");
  return value.trim();
};
export const orderEditRouter = Router();
orderEditRouter.use(requireAuth, requireAdmin);
orderEditRouter.get("/:id/history", async (req, res) => res.json(await OrderEdit.findAll({ where: { orderId: req.params.id }, order: [["createdAt", "DESC"]], limit: 50 })));
orderEditRouter.patch("/:id", async (req, res) => {
  try {
    const input = req.body;
    const reason = text(input.reason, 500, true);
    if (!ORDER_STATUSES.includes(input.status) || !["PICKUP", "DELIVERY"].includes(input.fulfillmentType) || !["CASH", "PIX", "ONLINE", "CREDIT_CARD", "DEBIT_CARD", "RECEIVED_ONLINE"].includes(input.paymentMethod) || !["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED", "EXPIRED"].includes(input.paymentStatus)) throw Error("Status, atendimento ou pagamento inválido.");
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) throw Error("Inclua de 1 a 100 itens.");
    const items = input.items.map((item: any) => {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw Error("Quantidade inválida.");
      if (!Array.isArray(item.options) || item.options.length > 50) throw Error("Opções do item inválidas.");
      const options = item.options.map((option: any) => ({ optionName: text(option.optionName, 120, true), optionGroupName: text(option.optionGroupName, 120, true), priceDelta: money(option.priceDelta), quantity: 1 }));
      const optionsTotal = Math.round(options.reduce((sum: number, option: any) => sum + option.priceDelta, 0) * 100) / 100;
      const unitPrice = money(item.unitPrice);
      return { productId: item.productId || null, productName: text(item.productName, 160, true), quantity: item.quantity, unitPrice, optionsTotal, lineTotal: money(Math.round((unitPrice + optionsTotal) * item.quantity * 100) / 100), notes: text(item.notes ?? "", 2000), options };
    });
    const settings = await getStoreSetting();
    const orderId = String(req.params.id);
    await sequelize.transaction(async transaction => {
      const snapshot = await Order.findByPk(orderId, { transaction });
      if (!snapshot) throw Error("Pedido não encontrado.");
      const sourceSession = snapshot.getDataValue("diningSessionId") as string | null;
      const targetSession = input.diningSessionId || null;
      // Use the same lock order as table checkout: table, session, order, inventory.
      const sessions = await DiningSession.findAll({ where: { id: { [Op.in]: [...new Set([sourceSession, targetSession].filter(Boolean))] } }, transaction });
      const tableIds = [...new Set(sessions.map(session => String(session.getDataValue("tableId"))))].sort();
      for (const id of tableIds) await DiningTable.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      for (const session of sessions) await session.reload({ transaction, lock: transaction.LOCK.UPDATE });
      const order = await Order.findByPk(orderId, { include, transaction, lock: transaction.LOCK.UPDATE });
      if (!order || order.getDataValue("diningSessionId") !== sourceSession || new Date(order.getDataValue("updatedAt")).toISOString() !== input.updatedAt) throw Error("O pedido mudou. Atualize antes de editar.");
      const before = JSON.parse(JSON.stringify(order.get({ plain: true })));
      const target = targetSession ? sessions.find(session => session.getDataValue("id") === targetSession) : null;
      const targetTable = target ? await DiningTable.findByPk(target.getDataValue("tableId"), { transaction }) : null;
      if (targetSession && (!target || !targetTable || (targetSession !== sourceSession && (target.getDataValue("closedAt") || targetTable.getDataValue("sessionId") !== targetSession || Number(targetTable.getDataValue("number")) > Number(settings.getDataValue("tableCount")))))) throw Error("Escolha uma comanda aberta para transferir o pedido.");
      const courier = input.courierId ? await Courier.findByPk(input.courierId, { transaction }) : null;
      const retainCourier = !!input.courierId && input.courierId === order.getDataValue("courierId");
      if (input.courierId && (!courier || !courier.getDataValue("active")) && !retainCourier) throw Error("Motoboy indisponível.");
      for (const item of items) if (item.productId && !await Product.findByPk(item.productId, { transaction })) throw Error("Produto vinculado não encontrado.");
      const subtotal = money(Math.round(items.reduce((sum: number, item: any) => sum + item.lineTotal, 0) * 100) / 100);
      const discountAmount = money(input.discountAmount), digitalSecurityFee = target ? 0 : money(input.digitalSecurityFee);
      const deliveryFee = !target && input.fulfillmentType === "DELIVERY" ? money(input.deliveryFee) : 0;
      if (discountAmount > subtotal) throw Error("O desconto não pode ultrapassar o subtotal.");
      const waiterFee = serviceFee(subtotal - discountAmount, input.serviceFeeAccepted, !!target);
      const total = money(Math.round((subtotal - discountAmount + digitalSecurityFee + deliveryFee + waiterFee) * 100) / 100);
      await revertOrderInventory(orderId, transaction);
      // The stock service updates a separate model instance; refresh flags before
      // clearing them so Sequelize writes the next revision's null markers.
      await order.reload({ transaction });
      for (const oldItem of await OrderItem.findAll({ where: { orderId }, transaction })) {
        await OrderItemOption.destroy({ where: { orderItemId: oldItem.getDataValue("id") }, transaction });
        await oldItem.destroy({ transaction });
      }
      for (const item of items) {
        const { options, ...fields } = item;
        const created = await OrderItem.create({ orderId, ...fields }, { transaction });
        for (const option of options) await OrderItemOption.create({ orderItemId: created.getDataValue("id"), ...option }, { transaction });
      }
      const paymentStatus = isCounterPayment(input.paymentMethod) && input.paymentStatus !== "APPROVED" ? "NOT_REQUIRED" : input.paymentStatus;
      const changes: Record<string, unknown> = { subtotal, discountAmount, digitalSecurityFee, deliveryFee, serviceFee: waiterFee, serviceFeeAccepted: input.serviceFeeAccepted === true, total,
        status: input.status, fulfillmentType: target ? "PICKUP" : input.fulfillmentType, paymentMethod: input.paymentMethod, paymentStatus,
        paymentProvider: "MANUAL", paymentExpiresAt: null, paymentExternalId: null, paymentCheckoutUrl: null, pixCopyPaste: null, pixQrCodeBase64: null,
        paidAt: paymentStatus === "APPROVED" ? order.getDataValue("paidAt") ?? new Date() : null,
        completedAt: input.status === "COMPLETED" ? order.getDataValue("completedAt") ?? new Date() : null,
        cancellationReason: input.status === "CANCELED" ? reason : null,
        inventoryRevision: Number(order.getDataValue("inventoryRevision")) + 1, inventoryProcessedAt: null, inventoryRevertedAt: null,
        diningSessionId: targetSession, tableNumber: targetTable?.getDataValue("number") ?? null,
        courierId: !target && input.fulfillmentType === "DELIVERY" ? courier?.getDataValue("id") ?? (retainCourier ? order.getDataValue("courierId") : null) : null,
        courierName: !target && input.fulfillmentType === "DELIVERY" ? courier?.getDataValue("name") ?? (retainCourier ? order.getDataValue("courierName") : null) : null,
      };
      for (const [key, max] of Object.entries({ customerName: 120, customerPhone: 30, customerEmail: 254, customerDocument: 14, notes: 2000, street: 180, number: 30, complement: 120, neighborhood: 120, city: 120, state: 2, postalCode: 12, addressReference: 255, couponCode: 50 })) changes[key] = text(input[key] ?? "", max, key === "customerName");
      changes.changeFor = input.changeFor == null ? null : money(input.changeFor);
      await order.update(changes, { transaction });
      if (input.status !== "CANCELED" && ["APPROVED", "NOT_REQUIRED"].includes(paymentStatus)) await applyOrderInventory(orderId, transaction);
      if (before.status !== input.status) await OrderStatusHistory.create({ orderId, status: input.status }, { transaction });
      for (const session of sessions) {
        if (!session.getDataValue("closedAt")) continue;
        const activeOrders = await Order.findAll({ where: { diningSessionId: session.getDataValue("id"), status: { [Op.ne]: "CANCELED" } }, transaction });
        const methods = [...new Set(activeOrders.map(item => item.getDataValue("paymentMethod")))];
        await session.update({ total: Math.round(activeOrders.reduce((sum, item) => sum + Number(item.getDataValue("total")), 0) * 100) / 100, paymentMethod: methods.length === 1 ? methods[0] : methods.length ? "MIXED" : null }, { transaction });
      }
      const after = await Order.findByPk(orderId, { include, transaction });
      await OrderEdit.create({ orderId, userId: String(res.locals.user.sub ?? res.locals.user.id), reason, before, after: JSON.parse(JSON.stringify(after!.get({ plain: true }))) }, { transaction });
    });
    const updated = await Order.findByPk(orderId, { include });
    req.app.get("io")?.to(ADMIN_ROOM).emit("order:updated", { id: orderId });
    req.app.get("io")?.to(`order:${orderId}`).emit("order:status", { id: orderId, status: updated?.getDataValue("status") });
    res.json(updated);
  } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : "Não foi possível corrigir o pedido." }); }
});
