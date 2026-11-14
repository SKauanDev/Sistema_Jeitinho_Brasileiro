import assert from "node:assert/strict";
import test from "node:test";
import { customerOrderLabel, isPaymentWaiting } from "../src/features/order-status/order-presentation.ts";

test("Pix, dinheiro e cartões manuais seguem o preparo sem confirmação, inclusive pendências antigas", () => {
  for (const paymentMethod of ["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD"] as const) {
    for (const paymentStatus of ["NOT_REQUIRED", "PENDING", "EXPIRED"] as const) {
      const order = { status: "NEW" as const, paymentStatus, paymentMethod, paymentProvider: "MANUAL" };
      assert.equal(isPaymentWaiting(order),false);
      assert.equal(customerOrderLabel(order),"Pedido recebido");
      assert.equal(customerOrderLabel({...order,status:"PREPARING"}),"Em preparo");
    }
  }
});
test("histórico de gateway e Online pendente preservam a identificação original", () => {
  assert.equal(isPaymentWaiting({status:"NEW",paymentMethod:"PIX",paymentProvider:"MERCADO_PAGO",paymentStatus:"PENDING"}),true);
  assert.equal(isPaymentWaiting({status:"NEW",paymentMethod:"ONLINE",paymentProvider:"MANUAL",paymentStatus:"PENDING"}),true);
  assert.equal(isPaymentWaiting({status:"COMPLETED",paymentStatus:"PENDING"}),false);
});
