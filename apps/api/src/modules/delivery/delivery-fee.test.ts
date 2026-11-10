import assert from "node:assert/strict";
import test from "node:test";
import { hasFixedDeliveryFee, resolveDeliveryFee } from "./delivery-fee.js";

test("uses regional fee until a fixed fee is configured", () => {
  assert.equal(resolveDeliveryFee(null, "7.50"), 7.5);
  assert.equal(resolveDeliveryFee("", "7.50"), 7.5);
});

test("fixed fee replaces regional fee, including free delivery", () => {
  assert.equal(hasFixedDeliveryFee(null), false);
  assert.equal(hasFixedDeliveryFee("7.00"), true);
  assert.equal(hasFixedDeliveryFee("0.00"), true);
  assert.equal(resolveDeliveryFee("4.99", "7.50"), 4.99);
  assert.equal(resolveDeliveryFee("0.00", "7.50"), 0);
});
