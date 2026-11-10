import { test } from "node:test";
import assert from "node:assert/strict";
import { customerOrderLabel, isPaymentWaiting } from "../src/features/order-status/order-presentation.ts";

test("pedido 19 pendente não é apresentado como recebido", () => {
  assert.equal(customerOrderLabel({ status: "NEW", paymentStatus: "PENDING" }), "Aguardando pagamento");
  assert.equal(isPaymentWaiting({ status: "NEW", paymentStatus: "PENDING" }), true);
});
test("distingue pedido pago, recusado, cancelado e finalizado", () => {
  assert.equal(customerOrderLabel({ status: "CANCELED", paymentStatus: "EXPIRED", cancellationReason: "Cancelado por falta de pagamento" }), "Cancelado por falta de pagamento");
  assert.equal(customerOrderLabel({ status: "NEW", paymentStatus: "APPROVED" }), "Pedido recebido");
  assert.equal(customerOrderLabel({ status: "NEW", paymentStatus: "NOT_REQUIRED" }), "Pedido recebido");
  assert.equal(customerOrderLabel({ status: "NEW", paymentStatus: "REJECTED" }), "Pagamento recusado");
  assert.equal(customerOrderLabel({ status: "CANCELED", paymentStatus: "PENDING" }), "Cancelado");
  assert.equal(customerOrderLabel({ status: "COMPLETED", paymentStatus: "APPROVED" }), "Finalizado");
});
