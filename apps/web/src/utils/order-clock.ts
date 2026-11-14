let anchor: { server: number; monotonic: number } | null = null;
export function synchronizeOrderClock(
  value: string | null,
  monotonic = performance.now(),
) {
  if (!value) return;
  const server = Date.parse(value);
  if (Number.isFinite(server)) anchor = { server, monotonic };
}
export function orderClockNow(
  monotonic = performance.now(),
  deviceNow = Date.now(),
) {
  return anchor
    ? anchor.server + Math.max(0, monotonic - anchor.monotonic)
    : deviceNow;
}
