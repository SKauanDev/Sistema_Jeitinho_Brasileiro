import type { Order } from "../types/admin";
export const orderIsFinished = (order: Pick<Order, "status">) => ["COMPLETED", "CANCELED"].includes(order.status);
export function orderFinishedAt(order: Pick<Order, "status" | "completedAt" | "statusHistory" | "updatedAt" | "createdAt">) {
  if (order.status === "COMPLETED" && order.completedAt) return new Date(order.completedAt);
  const history = order.statusHistory?.filter(entry => entry.status === order.status).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return new Date(history?.createdAt ?? order.updatedAt ?? order.createdAt);
}
export function finishedOrderLabel(order: Order, now = Date.now()) {
  const date = orderFinishedAt(order), today = new Date(now);
  const days = Math.max(0, Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000));
  const status = order.status === "CANCELED" ? "Cancelado" : "Finalizado";
  return `${status} ${days === 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`}`;
}
