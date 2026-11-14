import { PizzaValidationError } from "./pizza-sizes.js";
export function parseIngredients(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 40 || value.some(name => typeof name !== "string")) throw new PizzaValidationError("Informe até 40 ingredientes, com até 80 caracteres cada.");
  // Accept pasted lists with real line breaks, literal \\n or the common /n typo.
  const names = (value as string[]).flatMap(name => name.split(/\r\n|[\r\n]|\\n|\/n/)).map(name => name.trim()).filter(Boolean);
  if (names.length > 40 || names.some(name => name.length > 80)) throw new PizzaValidationError("Informe até 40 ingredientes, com até 80 caracteres cada.");
  if (new Set(names.map(name => name.toLocaleLowerCase("pt-BR"))).size !== names.length) throw new PizzaValidationError("Não repita ingredientes.");
  return names;
}
