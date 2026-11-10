import type { Order } from "../../types/admin";

export const isPaymentWaiting = (order: Pick<Order, "status" | "paymentStatus">) => !["CANCELED", "COMPLETED"].includes(order.status) && Boolean(order.paymentStatus && !["APPROVED", "NOT_REQUIRED"].includes(order.paymentStatus));
export function customerOrderLabel(order: Pick<Order, "status" | "paymentStatus"> & { cancellationReason?: string }) {
  if (order.status === "CANCELED") return order.cancellationReason === "Cancelado por falta de pagamento" ? "Cancelado por falta de pagamento" : "Cancelado";
  if (order.status === "COMPLETED") return "Finalizado";
  if (isPaymentWaiting(order)) return order.paymentStatus === "REJECTED" ? "Pagamento recusado" : order.paymentStatus === "EXPIRED" ? "Pagamento expirado" : "Aguardando pagamento";
  return { NEW: "Pedido recebido", CONFIRMED: "Confirmado", PREPARING: "Em preparo", READY: "Pronto", OUT_FOR_DELIVERY: "Saiu para entrega" }[order.status];
}
