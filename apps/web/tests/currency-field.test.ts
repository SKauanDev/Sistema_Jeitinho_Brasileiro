import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCurrencyField, parseCurrencyField } from "../src/utils/currency-field.js";

test("máscara monetária apresenta centavos durante a digitação", () => {
  assert.equal(parseCurrencyField("1"), 0.01);
  assert.equal(parseCurrencyField("10000"), 100);
  assert.equal(formatCurrencyField(parseCurrencyField("10000")!), "R$ 100,00");
  assert.equal(parseCurrencyField("R$ 100,00"), 100);
  assert.equal(parseCurrencyField(""), null);
  assert.equal(formatCurrencyField(""), "");
});
