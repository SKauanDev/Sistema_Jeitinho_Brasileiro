import type { Product } from "../data/menu";
import type { PizzaRules, PizzaMenu, PizzaStyle } from "../services/pizza-rules";
export type PizzaSelection = { mode: "whole" | "half"; leftId?: string; rightId?: string; borderId?: string };
export const pizzaKind = (category: string) => /doc[eê]/i.test(category) ? "SWEET" : /premium/i.test(category) ? "PREMIUM" : "TRADITIONAL";
export const compatibleFlavors = (a: Product, b: Product) => (pizzaKind(a.category) === "SWEET") === (pizzaKind(b.category) === "SWEET");
export const isPizzaFlavor = (product: Product) => !/combo/i.test(product.category) && (/pizza|premium/i.test(product.category) || product.pizzaSlots === 1);
export function productPrice(product: Product, size?: string) {
  return product.sizes?.length ? product.sizes.find(entry => entry.size === size)?.price ?? Math.min(...product.sizes.map(entry => entry.price)) : product.price;
}
export function stylesForProduct(product: Product, rules: PizzaRules) {
  return (rules.menus ?? []).filter(menu => menu.kind === pizzaKind(product.category) && menu.sizes.length > 0);
}
export function sizesForStyle(product: Product, rules: PizzaRules, style?: PizzaStyle) {
  return rules.menus?.length && isPizzaFlavor(product) ? stylesForProduct(product, rules).find(menu => menu.style === style)?.sizes ?? [] : product.sizes ?? [];
}
export function selectedPizzaMenu(product: Product, selections: PizzaSelection[], flavors: Product[], rules: PizzaRules, style?: PizzaStyle): PizzaMenu | undefined {
  const kinds = selections.flatMap(selection => (selection.mode === "half" ? [selection.leftId, selection.rightId] : [selection.leftId])).map(id => flavors.find(flavor => flavor.id === id)).filter((flavor): flavor is Product => !!flavor).map(flavor => pizzaKind(flavor.category));
  const kind = kinds.includes("PREMIUM") && kinds.includes("TRADITIONAL") ? "MIXED" : kinds[0] ?? pizzaKind(product.category);
  return rules.menus?.find(menu => menu.style === style && menu.kind === kind);
}
export function pizzaBorderMenu(menu: PizzaMenu | undefined, rules: PizzaRules, type: "SAVORY" | "SWEET" = "SAVORY") {
  return rules.menus?.find(row => row.kind === (type === "SWEET" ? "SWEET" : "TRADITIONAL") && row.style === menu?.style);
}
export function configuredBorderPrice(product: Product, selections: PizzaSelection[], flavors: Product[], rules: PizzaRules, style?: PizzaStyle) {
  if (rules.menus?.length && isPizzaFlavor(product)) {
    return selections.reduce((sum, pizza) => {
      if (!pizza.borderId) return sum;
      const border = rules.borders.find(border => border.id === pizza.borderId && border.active);
      const menu = border && pizzaBorderMenu(selectedPizzaMenu(product, selections, flavors, rules, style), rules, border.type);
      return border && menu?.borderMode === "PAID" && menu.borderPrice !== null && menu.borderIds.includes(border.id) ? sum + menu.borderPrice : NaN;
    }, 0);
  }
  return selections.reduce((sum, pizza) => sum + (rules.borders.find(border => border.id === pizza.borderId && border.active)?.price ?? 0), 0);
}
export function configuredPizzaPrice(product: Product, size: string | undefined, selections: PizzaSelection[], flavors: Product[], rules: PizzaRules = { traditional: [], mixed: [], borders: [] }, style?: PizzaStyle) {
  if (!isPizzaFlavor(product)) return productPrice(product, size);
  if (rules.menus?.length) {
    if (!style || !size || !sizesForStyle(product, rules, style).some(entry => entry.size === size)) return NaN;
    const selectedFlavors = selections.flatMap(selection => selection.mode === "half" ? [selection.leftId, selection.rightId] : [selection.leftId]).map(id => flavors.find(flavor => flavor.id === id));
    if (selectedFlavors.some(flavor => flavor && (!compatibleFlavors(product, flavor) || !sizesForStyle(flavor, rules, style).some(entry => entry.size === size)))) return NaN;
    return selectedPizzaMenu(product, selections, flavors, rules, style)?.sizes.find(entry => entry.size === size)?.price ?? NaN;
  }
  const prices = selections.flatMap(selection => (selection.mode === "half" ? [selection.leftId, selection.rightId] : [selection.leftId])
    .map(id => flavors.find(flavor => flavor.id === id)).filter((flavor): flavor is Product => !!flavor).map(flavor => productPrice(flavor, size)));
  const kinds = selections.flatMap(selection => (selection.mode === "half" ? [selection.leftId, selection.rightId] : [selection.leftId])).map(id => flavors.find(flavor => flavor.id === id)).filter((flavor): flavor is Product => !!flavor).map(flavor => pizzaKind(flavor.category));
  const fixed = kinds.length && kinds.every(kind => kind === "TRADITIONAL") ? rules.traditional : kinds.includes("PREMIUM") && kinds.includes("TRADITIONAL") ? rules.mixed : [];
  if (size && fixed.length) return fixed.find(entry => entry.size === size)?.price ?? NaN;
  return prices.length ? Math.max(...prices) : productPrice(product, size);
}
export function flavorAlreadyChosen(selection: PizzaSelection, flavorId: string) {
  return selection.mode === "half" && (selection.leftId === flavorId || selection.rightId === flavorId);
}
