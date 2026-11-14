import assert from "node:assert/strict";
import test from "node:test";
import {
  activePromotionPercent,
  configuredPromotionPercent,
  parsePromotionDays,
  parsePromotionPercent,
  pricingProduct,
  promotionalAmount,
  promotionDayActive,
  publicProductPromotion,
} from "./product-promotion.js";
import { resolvePizzaConfiguration } from "../orders/pizza-configuration.js";
import type { PizzaRules } from "../catalog/pizza-rules.js";
const days = [3, 4, 5];
test("QUA/QUI/SEX ativa e encerra automaticamente no fuso de São Paulo, incluindo a virada do dia", () => {
  const product = { price: 100, promotionalPrice: 80, promotionDays: days };
  for (let day = 0; day < 7; day++) {
    const now = new Date(
        `2026-11-${String(8 + day).padStart(2, "0")}T15:00:00Z`,
      ),
      active = days.includes(day);
    assert.equal(promotionDayActive(product, now), active);
    assert.equal(
      publicProductPromotion(product, now).promotionalPrice,
      active ? 80 : null,
    );
    assert.equal(
      pricingProduct(product, now).promotionalPrice,
      active ? 80 : null,
    );
  }
  assert.equal(
    promotionDayActive(product, new Date("2026-11-11T02:59:59Z")),
    false,
  );
  assert.equal(
    promotionDayActive(product, new Date("2026-11-11T03:00:00Z")),
    true,
  );
  assert.equal(
    promotionDayActive(product, new Date("2026-11-14T02:59:59Z")),
    true,
  );
  assert.equal(
    promotionDayActive(product, new Date("2026-11-14T03:00:00Z")),
    false,
  );
});
test("pizza por tamanho aplica percentual ao preço, sem descontar a borda; meio a meio usa o menor percentual", () => {
  const now = new Date("2026-11-11T18:00:00Z");
  const a = {
    id: "a",
    name: "QA A",
    category: "Pizzas",
    pizzaSlots: 1,
    price: 60,
    promotionDays: days,
    promotionDiscountPercent: 20,
  };
  const b = { ...a, id: "b", promotionDiscountPercent: 10 };
  const products = new Map([
    [a.id, a],
    [b.id, b],
  ]);
  const rules: PizzaRules = {
    traditional: [],
    mixed: [],
    borders: [
      { id: "border", name: "Queijo", type: "SAVORY", price: 15, active: true },
    ],
    menus: [
      {
        style: "NAPOLITANA",
        kind: "TRADITIONAL",
        sizes: [{ size: "G", price: 60 }],
        borderMode: "PAID",
        borderPrice: 15,
        borderIds: ["border"],
      },
    ],
  };
  const whole = [{ mode: "whole" as const, leftId: a.id, borderId: "border" }];
  const config = resolvePizzaConfiguration(
    a,
    "G",
    whole,
    products,
    rules,
    "NAPOLITANA",
  );
  const rate = configuredPromotionPercent(a, whole, products, now);
  assert.equal(
    promotionalAmount(config.unitPrice, rate) +
      config.options.reduce((sum, row) => sum + row.price, 0),
    63,
  );
  assert.equal(
    configuredPromotionPercent(
      a,
      [{ mode: "half", leftId: a.id, rightId: b.id }],
      products,
      now,
    ),
    10,
  );
  assert.equal(activePromotionPercent(a, new Date("2026-11-14T18:00:00Z")), 0);
});
test("agenda e desconto inválidos são recusados; agenda vazia preserva promoções antigas todos os dias", () => {
  for (const value of [[7], [3, 3], "3"])
    assert.throws(() => parsePromotionDays(value));
  for (const value of [-1, 100, "texto", 1.234])
    assert.throws(() => parsePromotionPercent(value));
  assert.equal(
    promotionDayActive({ promotionDays: [] }, new Date("2026-11-14T18:00:00Z")),
    true,
  );
  assert.equal(
    publicProductPromotion(
      { price: 100, promotionDiscountPercent: 10, promotionDays: [3] },
      new Date("2026-11-11T18:00:00Z"),
    ).promotionalPrice,
    "90.00",
  );
});
