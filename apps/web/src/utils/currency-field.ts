const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Monetary form inputs store a number, while displaying a Brazilian currency mask. */
export function formatCurrencyField(value: number | string): string {
  if (value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? brl.format(amount) : "";
}

/** Digits typed into a masked field represent cents: 10000 -> R$ 100,00. */
export function parseCurrencyField(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits) / 100 : null;
}
