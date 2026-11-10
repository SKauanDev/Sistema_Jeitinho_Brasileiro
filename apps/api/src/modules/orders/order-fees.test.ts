import assert from "node:assert/strict";
import { test } from "node:test";
import { DIGITAL_SECURITY_FEE, orderTotal } from "./order-fees.js";

test("taxa digital fixa não altera subtotal, frete ou desconto", () => {
  assert.equal(DIGITAL_SECURITY_FEE, 0.99);
  assert.equal(orderTotal(10, 0, 0), 10.99);
  assert.equal(orderTotal(10, 5, 2), 13.99);
  assert.equal(orderTotal(20, 0, 20), 0.99);
});
