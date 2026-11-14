import assert from "node:assert/strict";
import test from "node:test";
import type { Order } from "../src/types/admin.js";
import { finishedOrderLabel, orderFinishedAt, orderIsFinished } from "../src/utils/order-age.js";
const order = (changes: object) => ({ status: "COMPLETED", createdAt: new Date(2026, 9, 1).toISOString(), updatedAt: new Date(2026, 10, 13, 12).toISOString(), statusHistory: [], ...changes }) as Order;
const now = new Date(2026, 10, 13, 12).getTime();
test("finalização usa dias de calendário e a data de conclusão, não a criação", () => {
  assert.equal(finishedOrderLabel(order({ completedAt: new Date(2026, 10, 13, 0, 1).toISOString() }), now), "Finalizado hoje");
  assert.equal(finishedOrderLabel(order({ completedAt: new Date(2026, 10, 12, 23, 59).toISOString() }), now), "Finalizado ontem");
  assert.equal(finishedOrderLabel(order({ completedAt: new Date(2026, 10, 10, 18).toISOString() }), now), "Finalizado há 3 dias");
});
test("cancelamento usa o último evento de cancelamento mesmo após editar o pedido", () => {
  const canceled = order({ status: "CANCELED", statusHistory: [{ status: "CANCELED", createdAt: new Date(2026, 10, 9).toISOString() }, { status: "CANCELED", createdAt: new Date(2026, 10, 11).toISOString() }] });
  assert.equal(finishedOrderLabel(canceled, now), "Cancelado há 2 dias");
  assert.equal(orderFinishedAt(canceled).getDate(), 11);
  assert.equal(orderIsFinished(order({ status: "PREPARING" })), false);
});
