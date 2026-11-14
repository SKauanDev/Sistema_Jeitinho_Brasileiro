import assert from "node:assert/strict";
import test from "node:test";
import { parseIngredients } from "./ingredients.js";

test("lista colada com /n separa os 12 ingredientes sem ultrapassar o limite por nome", () => {
  assert.deepEqual(parseIngredients(["Creme cheese/ncheddar/nmussarela/nparmesão/nprovolone/nbarbecue/ncatchup/nmaionese/nmostarda/nalface/ncebola/ntomate"]), ["Creme cheese", "cheddar", "mussarela", "parmesão", "provolone", "barbecue", "catchup", "maionese", "mostarda", "alface", "cebola", "tomate"]);
  assert.deepEqual(parseIngredients(["Pão\r\nCarne\\nQueijo/nAlface/n"]), ["Pão", "Carne", "Queijo", "Alface"]);
});
test("limites e duplicatas continuam validados depois de separar a lista", () => {
  assert.throws(() => parseIngredients([Array.from({ length: 41 }, (_, i) => `Item ${i}`).join("/n")]));
  assert.throws(() => parseIngredients(["x".repeat(81)]));
  assert.throws(() => parseIngredients(["Queijo/nqueijo"]));
  assert.throws(() => parseIngredients([42]));
  assert.deepEqual(parseIngredients(null), []);
});
