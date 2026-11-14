import type { Order } from "../types/admin";
type WaitingOrder = Pick<
  Order,
  "id" | "status" | "createdAt" | "statusHistory"
>;
export function newOrderSince(order: WaitingOrder) {
  const entries = (order.statusHistory ?? [])
    .filter((event) => event.status === "NEW")
    .map((event) => new Date(event.createdAt).getTime())
    .filter(Number.isFinite);
  return entries.length
    ? Math.max(...entries)
    : new Date(order.createdAt).getTime();
}
export function newOrderMinutes(order: WaitingOrder, now: number) {
  const since = newOrderSince(order);
  return order.status === "NEW" && Number.isFinite(since)
    ? Math.max(0, Math.floor((now - since) / 60_000))
    : 0;
}
export function newOrderSeverity(order: WaitingOrder, now: number) {
  const minutes = newOrderMinutes(order, now);
  return minutes >= 30 ? "late" : minutes >= 20 ? "warning" : "normal";
}
export function dueNewOrderReminders(
  orders: WaitingOrder[],
  now: number,
  delivered: Map<string, string>,
) {
  const active = new Set(
    orders.filter((order) => order.status === "NEW").map((order) => order.id),
  );
  for (const id of delivered.keys()) if (!active.has(id)) delivered.delete(id);
  let due = false;
  for (const order of orders) {
    if (order.status !== "NEW") continue;
    const bucket = Math.floor(newOrderMinutes(order, now) / 10);
    const key = `${newOrderSince(order)}:${bucket}`;
    if (bucket > 0 && delivered.get(order.id) !== key) {
      delivered.set(order.id, key);
      due = true;
    }
  }
  return due;
}
