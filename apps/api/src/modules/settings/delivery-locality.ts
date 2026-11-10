import { normalizeRegion } from "./store-operation.service.js";

export function assertDeliveryLocality(store: { city: unknown; state: unknown }, address: { city?: unknown; state?: unknown }) {
  const city = normalizeRegion(store.city);
  const state = normalizeRegion(store.state);
  if (!city || !/^[a-z]{2}$/.test(state)) throw new Error("Entrega indisponível: configure cidade e UF do estabelecimento.");
  if (!normalizeRegion(address.city) || !normalizeRegion(address.state)) throw new Error("Informe cidade e UF para validar a entrega.");
  if (city !== normalizeRegion(address.city) || state !== normalizeRegion(address.state)) throw new Error("Ainda não entregamos nesta cidade/UF.");
}
