export function serviceFee(subtotal: number, accepted: unknown, table: boolean) {
  if (accepted !== undefined && typeof accepted !== "boolean") throw new PizzaValidationError("Informe se aceita a taxa de serviço.");
  if (accepted && !table) throw new PizzaValidationError("Taxa de garçom disponível apenas para comanda.");
  return accepted ? Math.round(subtotal * 10) / 100 : 0;
}
import { PizzaValidationError } from "../catalog/pizza-sizes.js";
