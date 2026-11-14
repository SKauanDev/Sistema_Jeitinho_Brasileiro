import assert from "node:assert/strict";
import test from "node:test";
import { serviceFee } from "./service-fee.js";
import { parseIngredients } from "../catalog/ingredients.js";
test("serviço é opcional, 10% arredondado e exclusivo da comanda", () => {
  assert.equal(serviceFee(25, true, true), 2.5);
  assert.equal(serviceFee(32.9, true, true), 3.29);
  assert.equal(serviceFee(12.34, true, true), 1.23);
  assert.equal(serviceFee(25, undefined, true), 0);
  assert.equal(serviceFee(25, false, true), 0);
  assert.throws(() => serviceFee(25, true, false));
  assert.throws(() => serviceFee(25, "false", true));
});
test("ingredientes rejeitam duplicatas, tipos e nomes inválidos", () => {
  assert.deepEqual(parseIngredients([" Pão ", "Carne"]), ["Pão", "Carne"]);
  assert.deepEqual(parseIngredients(null), []);
  for (const value of [["Queijo", "queijo"], [""], [123], "Carne", Array(41).fill("Pão")]) assert.throws(() => parseIngredients(value));
});
