import assert from "node:assert/strict";
import test from "node:test";
import {
  orderClockNow,
  synchronizeOrderClock,
} from "../src/utils/order-clock.ts";
import { newOrderSeverity } from "../src/utils/order-waiting.ts";
test("tempo dos pedidos usa relógio do servidor e avanço monotônico, mesmo com relógio do dispositivo incorreto", () => {
  assert.equal(orderClockNow(100, 999), 999);
  const server = Date.parse("2026-11-14T21:00:00Z");
  synchronizeOrderClock(new Date(server).toISOString(), 100);
  const order = {
    id: "qa",
    status: "NEW" as const,
    createdAt: new Date(server).toISOString(),
    statusHistory: [],
  };
  assert.equal(orderClockNow(60100, server + 5 * 3600000), server + 60000);
  assert.equal(
    newOrderSeverity(order, orderClockNow(20 * 60000 + 100, server - 3600000)),
    "warning",
  );
  assert.equal(
    newOrderSeverity(order, orderClockNow(30 * 60000 + 100, server + 3600000)),
    "late",
  );
  synchronizeOrderClock("invalid", 100);
  assert.equal(orderClockNow(60100), server + 60000);
});
