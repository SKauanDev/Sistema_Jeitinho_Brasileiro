// Independent, fixed per-order digital purchase security fee.
export const DIGITAL_SECURITY_FEE = 0.99;

export function orderTotal(subtotal: number, deliveryFee: number, discountAmount: number): number {
  return Number((subtotal + DIGITAL_SECURITY_FEE + deliveryFee - discountAmount).toFixed(2));
}
