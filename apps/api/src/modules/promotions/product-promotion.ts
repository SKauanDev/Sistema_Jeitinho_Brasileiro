type Promotion = {
  promotionDays?: unknown;
  promotionDiscountPercent?: unknown;
  promotionalPrice?: unknown;
};
export function parsePromotionDays(value: unknown): number[] {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.length > 7 ||
    value.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(value).size !== value.length
  )
    throw Error("Selecione dias da semana válidos, sem repetir.");
  return [...value].sort((a, b) => a - b);
}
export function parsePromotionPercent(value: unknown): number | null {
  if (value == null || value === "" || Number(value) === 0) return null;
  const percent = Number(value);
  if (
    !Number.isFinite(percent) ||
    percent <= 0 ||
    percent >= 100 ||
    Math.abs(percent * 100 - Math.round(percent * 100)) > 0.00001
  )
    throw Error(
      "Informe um desconto maior que 0 e menor que 100%, com até duas casas decimais.",
    );
  return percent;
}
export function promotionDayActive(product: Promotion, now = new Date()) {
  const days = parsePromotionDays(product.promotionDays);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
    }).format(now),
  );
  return !days.length || days.includes(weekday);
}
export function activePromotionPercent(product: Promotion, now = new Date()) {
  return promotionDayActive(product, now)
    ? Number(product.promotionDiscountPercent ?? 0)
    : 0;
}
export function promotionalAmount(base: number, percent: number) {
  return percent > 0 && base > 0
    ? Math.max(0.01, Math.round(base * (100 - percent)) / 100)
    : base;
}
export function pricingProduct<T extends Promotion>(
  product: T,
  now = new Date(),
): T {
  return {
    ...product,
    promotionalPrice:
      promotionDayActive(product, now) &&
      !Number(product.promotionDiscountPercent)
        ? product.promotionalPrice
        : null,
  };
}
export function configuredPromotionPercent(
  product: Promotion & { category?: string; pizzaSlots?: number },
  selections: unknown,
  products: Map<string, Promotion>,
  now = new Date(),
) {
  const pizza =
    !/combo/i.test(product.category ?? "") &&
    (/pizza|premium/i.test(product.category ?? "") || product.pizzaSlots === 1);
  if (!pizza || !Array.isArray(selections) || !selections.length)
    return activePromotionPercent(product, now);
  const rates = selections
    .flatMap((selection) =>
      selection.mode === "half"
        ? [selection.leftId, selection.rightId]
        : [selection.leftId],
    )
    .map((id) => activePromotionPercent(products.get(id) ?? {}, now));
  return rates.length ? Math.min(...rates) : 0;
}
export function publicProductPromotion<
  T extends Promotion & { price: unknown },
>(product: T, now = new Date()) {
  const percent = activePromotionPercent(product, now);
  const fixed =
    promotionDayActive(product, now) && product.promotionalPrice != null;
  return {
    ...product,
    promotionActive: percent > 0 || Boolean(fixed),
    promotionalPrice:
      percent > 0
        ? promotionalAmount(Number(product.price), percent).toFixed(2)
        : fixed
          ? product.promotionalPrice
          : null,
  };
}
