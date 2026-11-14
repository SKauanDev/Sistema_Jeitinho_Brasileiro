import type { Order } from "../../types/admin";

type PaymentOrder = Pick<Order, "status" | "paymentStatus"> & Partial<Pick<Order, "paymentMethod" | "paymentProvider">>;
export const isCounterPayment = (order: Partial<Pick<Order, "paymentMethod" | "paymentProvider">>) => (order.paymentProvider == null || order.paymentProvider === "MANUAL") && ["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(order.paymentMethod ?? "");
export const isPaymentWaiting = (order: PaymentOrder) => !isCounterPayment(order) && !["CANCELED", "COMPLETED"].includes(order.status) && Boolean(order.paymentStatus && !["APPROVED", "NOT_REQUIRED"].includes(order.paymentStatus));
export function customerOrderLabel(order: PaymentOrder & { cancellationReason?: string }) {
  if (order.status === "CANCELED") return order.cancellationReason === "Cancelado por falta de pagamento" ? "Cancelado por falta de pagamento" : "Cancelado";
  if (order.status === "COMPLETED") return "Finalizado";
  if (isPaymentWaiting(order)) return order.paymentStatus === "REJECTED" ? "Pagamento recusado" : order.paymentStatus === "EXPIRED" ? "Pagamento expirado" : "Aguardando pagamento";
  return { NEW: "Pedido recebido", CONFIRMED: "Confirmado", PREPARING: "Em preparo", READY: "Pronto", OUT_FOR_DELIVERY: "Saiu para entrega" }[order.status];
}
