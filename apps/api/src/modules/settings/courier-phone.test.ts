import assert from "node:assert/strict";
import test from "node:test";
import { courierPhone } from "./courier-phone.js";
test("telefone de motoboy aceita celular, fixo e prefixo nacional; rejeita número incompleto", () => {
  assert.equal(courierPhone("31999991234"), "(31) 99999-1234");
  assert.equal(courierPhone("+55 (31) 99999-1234"), "(31) 99999-1234");
  assert.equal(courierPhone("3133331234"), "(31) 3333-1234");
  assert.equal(courierPhone(""), "");
  assert.throws(() => courierPhone("12345")); assert.throws(() => courierPhone("abc"));
});
