export function orderQuantity(value: unknown) {
  const quantity = Number(value ?? 1);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Quantidade inválida: informe um número inteiro maior que zero.");
  return quantity;
}

export function groupedQuantities(items: Array<{ productId?: unknown; quantity?: unknown }>) {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    const id = String(item.productId);
    const total = (totals.get(id) ?? 0) + orderQuantity(item.quantity);
    if (!Number.isSafeInteger(total)) throw new Error("Quantidade inválida.");
    totals.set(id, total);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b));
}

export function assertAvailableStock(name: string, stock: number, requested: number, reserved = 0) {
  const available = Math.max(0, stock - reserved);
  if (!Number.isFinite(stock) || !Number.isFinite(reserved) || requested > available) {
    throw new Error(`Estoque insuficiente para ${name}. Disponível: ${available}; solicitado: ${requested}.`);
  }
}
