export function hasFixedDeliveryFee(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function resolveDeliveryFee(fixedFee: unknown, zoneFee: unknown): number {
  return hasFixedDeliveryFee(fixedFee) ? Number(fixedFee) : Number(zoneFee);
}
