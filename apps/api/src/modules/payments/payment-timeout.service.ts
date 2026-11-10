import { Op } from "sequelize";
import type { Server } from "socket.io";
import { Order, OrderStatusHistory } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { ADMIN_ROOM } from "../../realtime/socket-security.js";
import { revertOrderInventory } from "../inventory/catalog-inventory.service.js";

export const PAYMENT_TIMEOUT_MS = 6 * 60000;
export const PAYMENT_TIMEOUT_REASON = "Cancelado por falta de pagamento";
export function paymentDeadline(order: any) {
  const created = new Date(order.getDataValue("createdAt")).getTime() + PAYMENT_TIMEOUT_MS;
  const configured = order.getDataValue("paymentExpiresAt");
  return new Date(configured ? Math.min(created, new Date(configured).getTime()) : created);
}
export function shouldExpirePayment(order: any, now = Date.now()) {
  return ["PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(String(order.getDataValue("paymentMethod")))
    && ["PENDING", "REJECTED"].includes(String(order.getDataValue("paymentStatus")))
    && !["CANCELED", "COMPLETED"].includes(String(order.getDataValue("status")))
    && paymentDeadline(order).getTime() <= now;
}
export async function expireUnpaidOrder(order: any, io?: Server) {
  if (!shouldExpirePayment(order)) return false;
  const id = String(order.getDataValue("id"));
  const canceled = await sequelize.transaction(async transaction => {
    const current = await Order.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current || !shouldExpirePayment(current)) return false;
    await current.update({ status: "CANCELED", paymentStatus: "EXPIRED", paymentExpiresAt: paymentDeadline(current), cancellationReason: PAYMENT_TIMEOUT_REASON }, { transaction });
    await OrderStatusHistory.create({ orderId: id, status: "CANCELED" }, { transaction });
    await revertOrderInventory(id, transaction);
    return true;
  });
  if (canceled) {
    const event = { id, status: "CANCELED", paymentStatus: "EXPIRED", cancellationReason: PAYMENT_TIMEOUT_REASON };
    io?.to(ADMIN_ROOM).emit("order:updated", event);
    io?.to(`order:${id}`).emit("order:status", event);
    io?.to(`order:${id}`).emit("order:payment", event);
    await order.reload();
    if (order.getDataValue("paymentProvider") === "MERCADO_PAGO" && order.getDataValue("paymentExternalId")) {
      try {
        const { cancelMercadoPagoPayment } = await import("./mercado-pago.service.js");
        await cancelMercadoPagoPayment(String(order.getDataValue("paymentExternalId")));
      } catch (error) {
        console.error("Falha ao cancelar cobrança pendente no Mercado Pago:", error);
      }
    } else if (order.getDataValue("paymentProvider") === "MERCADO_PAGO_ORDERS" && order.getDataValue("paymentExternalId")) {
      try {
        const { cancelMercadoPagoPixOrder } = await import("./mercado-pago.service.js");
        await cancelMercadoPagoPixOrder(String(order.getDataValue("paymentExternalId")));
      } catch (error) {
        console.error("Falha ao cancelar cobrança PIX no Mercado Pago:", error);
      }
    }
  }
  return canceled;
}
export async function expireUnpaidOrders(io?: Server, customerPhones?: string[]) {
  const orders = await Order.findAll({ where: {
    paymentMethod: { [Op.in]: ["PIX", "CREDIT_CARD", "DEBIT_CARD"] },
    paymentStatus: { [Op.in]: ["PENDING", "REJECTED"] },
    status: { [Op.notIn]: ["CANCELED", "COMPLETED"] },
    createdAt: { [Op.lte]: new Date(Date.now() - PAYMENT_TIMEOUT_MS) },
    ...(customerPhones ? { customerPhone: { [Op.in]: customerPhones } } : {}),
  } });
  for (const order of orders) await expireUnpaidOrder(order, io);
}
