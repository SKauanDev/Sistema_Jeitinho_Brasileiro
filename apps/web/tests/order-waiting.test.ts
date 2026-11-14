import assert from "node:assert/strict";
import test from "node:test";
import {
  dueNewOrderReminders,
  newOrderMinutes,
  newOrderSeverity,
} from "../src/utils/order-waiting.ts";
const start = Date.parse("2026-11-14T18:00:00Z");
const order = {
  id: "qa",
  status: "NEW" as const,
  createdAt: new Date(start).toISOString(),
  statusHistory: [],
};
test("novo muda para amarelo aos 20 minutos e vermelho aos 30", () => {
  for (const [minutes, severity] of [
    [0, "normal"],
    [10, "normal"],
    [19, "normal"],
    [20, "warning"],
    [29, "warning"],
    [30, "late"],
    [80, "late"],
  ] as const)
    assert.equal(newOrderSeverity(order, start + minutes * 60000), severity);
  const reopened = {
    ...order,
    statusHistory: [
      {
        id: "e",
        status: "NEW" as const,
        createdAt: new Date(start + 60 * 60000).toISOString(),
      },
    ],
  };
  assert.equal(newOrderMinutes(reopened, start + 70 * 60000), 10);
});
test("lembrete a cada 10 minutos, sem repetição no mesmo intervalo e só enquanto novo", () => {
  const delivered = new Map<string, string>();
  assert.equal(dueNewOrderReminders([order], start + 599999, delivered), false);
  assert.equal(dueNewOrderReminders([order], start + 600000, delivered), true);
  assert.equal(dueNewOrderReminders([order], start + 610000, delivered), false);
  assert.equal(dueNewOrderReminders([order], start + 1200000, delivered), true);
  assert.equal(
    dueNewOrderReminders(
      [{ ...order, status: "CONFIRMED" }],
      start + 1800000,
      delivered,
    ),
    false,
  );
  assert.equal(delivered.size, 0);
  assert.equal(
    dueNewOrderReminders([order], start + 45 * 60000, delivered),
    true,
  );
  assert.equal(
    dueNewOrderReminders([order], start + 45 * 60000, delivered),
    false,
  );
});
