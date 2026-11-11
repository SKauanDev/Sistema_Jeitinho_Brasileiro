import type { Server } from "socket.io";
import { fetchAndReconcile } from "./mercado-pago.service.js";

// Initial rendering uses the stored state; verification still happens on the server.
const pending = new Map<string, Promise<unknown>>();
export function warmPaymentStatus(order: any, io?: Server): Promise<unknown> | undefined {
  if (order.getDataValue("paymentStatus") !== "PENDING" || !order.getDataValue("paymentExternalId")) return;
  const id = String(order.getDataValue("id"));
  if (pending.has(id)) return pending.get(id);
  const task = Promise.resolve().then(() => fetchAndReconcile(order, io)).catch(error => {
    console.warn("Falha temporária ao atualizar o pagamento:", error instanceof Error ? error.message : "erro desconhecido");
  }).finally(() => { if (pending.get(id) === task) pending.delete(id); });
  pending.set(id, task);
  return task;
}
