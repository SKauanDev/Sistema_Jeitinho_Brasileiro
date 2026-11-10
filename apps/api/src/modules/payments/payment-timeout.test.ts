import { test, after } from "node:test";
import assert from "node:assert/strict";
import { paymentDeadline, shouldExpirePayment, PAYMENT_TIMEOUT_MS } from "./payment-timeout.service.js";
import { sequelize } from "../../database/sequelize.js";

after(async () => { await sequelize.close(); });
const created = Date.parse("2026-09-05T16:18:36Z");
const order = (changes: Record<string, unknown> = {}) => {
  const fields = { createdAt: new Date(created), paymentMethod: "CREDIT_CARD", paymentStatus: "PENDING", status: "NEW", ...changes };
  return { getDataValue: (key: string) => fields[key as keyof typeof fields] };
};
test("cartão antigo sem prazo registrado expira aos seis minutos", () => {
  assert.equal(paymentDeadline(order()).getTime(), created + PAYMENT_TIMEOUT_MS);
  assert.equal(shouldExpirePayment(order(), created + PAYMENT_TIMEOUT_MS - 1), false);
  assert.equal(shouldExpirePayment(order(), created + PAYMENT_TIMEOUT_MS), true);
});
test("não reinicia prazo nem cancela pagos, concluídos ou pagamento na entrega", () => {
  const now = created + PAYMENT_TIMEOUT_MS + 1000;
  assert.equal(paymentDeadline(order({ paymentExpiresAt: new Date(created + 3600000) })).getTime(), created + PAYMENT_TIMEOUT_MS);
  assert.equal(shouldExpirePayment(order({ paymentMethod: "PIX" }), now), true);
  assert.equal(shouldExpirePayment(order({ paymentMethod: "DEBIT_CARD", paymentStatus: "REJECTED" }), now), true);
  assert.equal(shouldExpirePayment(order({ paymentStatus: "APPROVED" }), now), false);
  assert.equal(shouldExpirePayment(order({ status: "CANCELED" }), now), false);
  assert.equal(shouldExpirePayment(order({ status: "COMPLETED" }), now), false);
  assert.equal(shouldExpirePayment(order({ paymentMethod: "CASH" }), now), false);
  assert.equal(shouldExpirePayment(order({ paymentMethod: "ONLINE" }), now), false);
});
