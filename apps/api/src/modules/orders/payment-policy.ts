// These methods only record how the customer intends to pay at the restaurant.
// They never depend on a gateway or on payment confirmation to enter production.
export function isCounterPayment(method: unknown, provider: unknown = "MANUAL") {
  return (provider == null || provider === "MANUAL") && ["CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(String(method));
}
