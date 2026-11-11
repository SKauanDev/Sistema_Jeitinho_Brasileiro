export class PizzaValidationError extends Error {}
export const PIZZA_SIZES = ["P", "M", "G", "GG"] as const;
export type PizzaSize = typeof PIZZA_SIZES[number];
export type SizePrice = { size: PizzaSize; price: number };

export function parseSizes(value: unknown): SizePrice[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 4) throw new PizzaValidationError("Informe os tamanhos P, M, G ou GG com preços válidos.");
  const seen = new Set<string>();
  const sizes = value.map((entry) => {
    const size = entry?.size;
    const price = Number(entry?.price);
    if (!PIZZA_SIZES.includes(size) || seen.has(size) || !Number.isFinite(price) || price <= 0 || price > 99999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > .00001) {
      throw new PizzaValidationError("Cada tamanho precisa de um preço positivo com até duas casas decimais, sem repetições.");
    }
    seen.add(size);
    return { size: size as PizzaSize, price };
  });
  return sizes.sort((a, b) => PIZZA_SIZES.indexOf(a.size) - PIZZA_SIZES.indexOf(b.size));
}

export function sizePrice(product: { sizes?: unknown; price: unknown; promotionalPrice?: unknown }, size?: string): number {
  const sizes = parseSizes(product.sizes);
  if (sizes.length) {
    const entry = sizes.find(entry => entry.size === size);
    if (!entry) throw new PizzaValidationError("Selecione um tamanho disponível para esta pizza.");
    return entry.price;
  }
  if (size) throw new PizzaValidationError("Este produto não possui o tamanho selecionado.");
  return Number(product.promotionalPrice ?? product.price);
}
