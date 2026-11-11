import type { Product } from "../data/menu";
export type PizzaSelection = { mode: "whole" | "half"; leftId?: string; rightId?: string };
export const isPizzaFlavor = (product: Product) => !/combo/i.test(product.category) && (/pizza/i.test(product.category) || product.pizzaSlots === 1);
export function productPrice(product: Product, size?: string) {
  return product.sizes?.length ? product.sizes.find(entry => entry.size === size)?.price ?? Math.min(...product.sizes.map(entry => entry.price)) : product.price;
}
export function configuredPizzaPrice(product: Product, size: string | undefined, selections: PizzaSelection[], flavors: Product[]) {
  if (!isPizzaFlavor(product)) return productPrice(product, size);
  const prices = selections.flatMap(selection => (selection.mode === "half" ? [selection.leftId, selection.rightId] : [selection.leftId])
    .map(id => flavors.find(flavor => flavor.id === id)).filter((flavor): flavor is Product => !!flavor).map(flavor => productPrice(flavor, size)));
  return prices.length ? Math.max(...prices) : productPrice(product, size);
}
export function flavorAlreadyChosen(selection: PizzaSelection, flavorId: string) {
  return selection.mode === "half" && (selection.leftId === flavorId || selection.rightId === flavorId);
}
