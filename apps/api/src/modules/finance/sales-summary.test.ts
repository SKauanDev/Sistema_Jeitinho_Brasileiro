import assert from "node:assert/strict";
import test from "node:test";
import { salesSummary } from "./sales-summary.js";
import { businessDate, financialPeriod } from "./financial-period.js";
const sale = (fields: object) => ({ status: "COMPLETED", fulfillmentType: "DELIVERY", subtotal: "0", total: "0", ...fields });
test("composição reconcilia descontos, serviço e entrega sem duplicar receita; taxas por motoboy preservam excluídos", () => {
  const result = salesSummary([
    sale({ subtotal: 100, discountAmount: 10, deliveryFee: 8, digitalSecurityFee: 1, total: 99, courierId: "a" }),
    sale({ subtotal: 50, deliveryFee: 5, digitalSecurityFee: 1, total: 56, courierId: "a" }),
    sale({ subtotal: 30, deliveryFee: 7, digitalSecurityFee: 1, total: 38, courierId: "deleted", courierName: "Motoboy anterior" }),
    sale({ subtotal: 20, deliveryFee: 4, digitalSecurityFee: 1, total: 25 }),
    sale({ fulfillmentType: "PICKUP", tableNumber: 1, subtotal: 80, serviceFee: 8, total: 88 }),
    sale({ fulfillmentType: "PICKUP", diningSessionId: "session", subtotal: 40, discountAmount: 10, serviceFee: 3, total: 33 }),
    sale({ fulfillmentType: "PICKUP", subtotal: 25, digitalSecurityFee: 1, total: 26 }),
    sale({ status: "CANCELED", total: 999, deliveryFee: 999 }), sale({ status: "NEW", total: 500 }),
  ], [{ id: "a", name: "Motoboy A", active: true }, { id: "inactive", name: "Inativo", active: false }]);
  assert.deepEqual(result.composition, { grossSales: 345, discounts: 20, netSales: 325, deliveryFees: 24, serviceFees: 11, digitalFees: 5, total: 365, serviceOrders: 2, serviceBase: 110 });
  assert.equal(result.courierFees.reduce((sum, courier) => sum + courier.deliveryFees, 0), 24);
  assert.equal(result.courierFees.find(courier => courier.id === "a")!.deliveryFees, 13);
  assert.equal(result.courierFees.find(courier => courier.id === "deleted")!.registered, false);
  assert.equal(result.courierFees.find(courier => courier.name === "Sem motoboy definido")!.deliveryFees, 4);
  assert.deepEqual(result.salesChannels.map(channel => [channel.ordersCount, channel.revenue]), [[4, 218], [2, 121], [1, 26]]);
});
test("centavos são somados sem acumular erro de ponto flutuante e períodos vazios mostram zero", () => {
  const result = salesSummary([sale({ subtotal: .1, total: .1 }), sale({ subtotal: .2, total: .2 })]);
  assert.equal(result.composition.total, .3);
  assert.equal(salesSummary([]).composition.total, 0);
  assert.equal(salesSummary([]).courierFees.length, 0);
});
test("período usa o dia comercial de São Paulo e inclui o fim do dia sem acrescentar outra data", () => {
  const result = financialPeriod("custom", "2026-11-01", "2026-11-13");
  assert.equal(result.start.toISOString(), "2026-11-01T03:00:00.000Z");
  assert.equal(result.end.toISOString(), "2026-11-14T02:59:59.999Z");
  assert.equal(businessDate(new Date("2026-11-14T02:45:00Z")), "2026-11-13");
  assert.equal(financialPeriod("previous_month", "", "", new Date("2026-11-13T15:00:00Z")).endDate, "2026-10-31");
  assert.throws(() => financialPeriod("custom", "2026-02-30", "2026-11-13"));
  assert.throws(() => financialPeriod("custom", "2026-11-14", "2026-11-13"));
});
