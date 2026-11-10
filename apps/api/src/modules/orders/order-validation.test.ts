import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Transaction } from "sequelize";
import { assertAvailableStock, groupedQuantities, orderQuantity } from "../inventory/stock-validation.js";
import { assertDeliveryLocality } from "../settings/delivery-locality.js";
import { validateOrderInventory, applyOrderInventory, revertOrderInventory } from "../inventory/catalog-inventory.service.js";
import { Category, Product, InventoryItem, Order, OrderItem } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";

after(async () => { await sequelize.close(); });

test("rejeita quantidades inválidas e soma linhas repetidas", () => {
  for (const value of [0, -1, 1.5, "abc", Infinity]) assert.throws(() => orderQuantity(value));
  assert.equal(orderQuantity(2), 2);
  assert.deepEqual(groupedQuantities([{ productId: "b", quantity: 6 }, { productId: "a", quantity: 1 }, { productId: "b", quantity: 5 }]), [["a", 1], ["b", 11]]);
});
test("estoque e reservas impedem venda acima do disponível", () => {
  assert.doesNotThrow(() => assertAvailableStock("Coca-Cola", 10, 10));
  assert.throws(() => assertAvailableStock("Coca-Cola", 10, 11), /Estoque insuficiente/);
  assert.throws(() => assertAvailableStock("Coca-Cola", 0, 1));
  assert.doesNotThrow(() => assertAvailableStock("Coca-Cola", 10, 2, 8));
  assert.throws(() => assertAvailableStock("Coca-Cola", 10, 3, 8));
});
test("cidade e UF devem coincidir com a loja, independentemente do bairro", () => {
  const store = { city: "Além Paraíba", state: "MG" };
  assert.doesNotThrow(() => assertDeliveryLocality(store, { city: " alem paraiba ", state: "mg" }));
  assert.throws(() => assertDeliveryLocality(store, { city: "Juiz de Fora", state: "MG" }), /cidade\/UF/);
  assert.throws(() => assertDeliveryLocality(store, { city: "Além Paraíba", state: "RJ" }), /cidade\/UF/);
  assert.throws(() => assertDeliveryLocality(store, {}), /cidade e UF/);
  assert.throws(() => assertDeliveryLocality({ city: "", state: "" }, store), /configure/);
});

test("MySQL: reserva, cancelamento, baixa agregada e estorno sem persistir fixtures", { skip: process.env.RUN_DB_VALIDATION_TESTS !== "true" }, async () => {
  const transaction = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED });
  try {
    const category = await Category.create({ name: "Teste estoque", slug: `validation-${randomUUID()}` }, { transaction });
    const product = await Product.create({ categoryId: category.getDataValue("id"), name: "Teste bebida", price: 10 }, { transaction });
    const productId = String(product.getDataValue("id"));
    const inventory = await InventoryItem.create({ productId, name: "Teste bebida", category: "Bebidas", currentStock: 10 }, { transaction });
    await assert.rejects(validateOrderInventory([{ productId, quantity: 6 }, { productId, quantity: 5 }], transaction), /Estoque insuficiente/);
    const order = await Order.create({ customerName: "Teste", customerPhone: "32999990000", fulfillmentType: "PICKUP", paymentMethod: "PIX", paymentStatus: "PENDING", subtotal: 80, total: 80 }, { transaction });
    const orderId = String(order.getDataValue("id"));
    for (const quantity of [3, 5]) await OrderItem.create({ orderId, productId, productName: "Teste bebida", quantity, unitPrice: 10, lineTotal: quantity * 10 }, { transaction });
    await assert.rejects(validateOrderInventory([{ productId, quantity: 3 }], transaction), /Estoque insuficiente/);
    await validateOrderInventory([{ productId, quantity: 2 }], transaction);
    await order.update({ status: "CANCELED" }, { transaction });
    await validateOrderInventory([{ productId, quantity: 10 }], transaction);
    await order.update({ status: "NEW", paymentStatus: "APPROVED" }, { transaction });
    assert.equal(await applyOrderInventory(orderId, transaction), true);
    assert.equal(Number((await inventory.reload({ transaction })).getDataValue("currentStock")), 2);
    assert.equal(await applyOrderInventory(orderId, transaction), false);
    await revertOrderInventory(orderId, transaction);
    assert.equal(Number((await inventory.reload({ transaction })).getDataValue("currentStock")), 10);
  } finally { await transaction.rollback(); }
});
