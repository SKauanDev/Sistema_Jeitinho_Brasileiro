import { createHmac, timingSafeEqual } from "node:crypto";

export function validMercadoPagoWebhook(input: {
  secret: string;
  dataId: string;
  requestId: string;
  signature: string;
  now?: number;
}) {
  const parts = Object.fromEntries(input.signature.split(",").map(part => part.trim().split("=", 2)));
  const timestamp = Number(parts.ts);
  if (!input.secret || !input.dataId || !input.requestId || !Number.isFinite(timestamp) || !/^[a-f0-9]{64}$/i.test(parts.v1 ?? "")) return false;
  // Accept the documented millisecond timestamp, with a bounded replay window.
  const timestampMs = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  if (Math.abs((input.now ?? Date.now()) - timestampMs) > 5 * 60_000) return false;
  const manifest = `id:${input.dataId.toLowerCase()};request-id:${input.requestId};ts:${parts.ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, "hex"));
}
