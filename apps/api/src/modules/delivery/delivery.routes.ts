import { Router } from "express";
import { DeliveryZone } from "../../database/models.js";
import { hasFixedDeliveryFee, resolveDeliveryFee } from "./delivery-fee.js";
import { requireAdmin, requireAuth } from "../../shared/auth.middleware.js";
import { assertDeliveryLocality } from "../settings/delivery-locality.js";
import {
  effectiveStoreStatus,
  getStoreSetting,
  paymentMethods,
  resolveDeliveryZone,
} from "../settings/store-operation.service.js";

export const deliveryRouter = Router();
const locationCache = new Map<
  string,
  {
    expiresAt: number;
    results: Array<{
      name: string;
      city: string;
      state: string;
      label: string;
    }>;
  }
>();
let lastLocationRequestAt = 0;
const postalLocationCache = new Map<
  string,
  { expiresAt: number; city: string; state: string }
>();

async function storeLocationFromPostalCode(settings: any) {
  const postalCode = String(settings.getDataValue("postalCode") ?? "").replace(
    /\D/g,
    "",
  );
  if (postalCode.length !== 8)
    throw new Error(
      "Cadastre um CEP válido para a loja antes de buscar bairros.",
    );
  const cached = postalLocationCache.get(postalCode);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const upstream = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
    headers: { Accept: "application/json", "User-Agent": "UrFood-ERP/1.0" },
  });
  if (!upstream.ok)
    throw new Error("Não foi possível validar o CEP cadastrado na loja.");
  const address = (await upstream.json()) as {
    erro?: boolean;
    localidade?: string;
    uf?: string;
  };
  if (address.erro || !address.localidade || !address.uf)
    throw new Error("O CEP cadastrado na loja não foi encontrado.");
  const result = {
    expiresAt: Date.now() + 24 * 60 * 60_000,
    city: address.localidade,
    state: address.uf,
  };
  postalLocationCache.set(postalCode, result);
  return result;
}

deliveryRouter.get(
  "/locations",
  requireAuth,
  requireAdmin,
  async (request, response) => {
    const query = String(request.query.q ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 100);
    if (query.length < 3) {
      response
        .status(400)
        .json({ message: "Digite ao menos 3 caracteres do bairro." });
      return;
    }
    const settings = await getStoreSetting();
    let storeCity = "";
    let storeState = "";
    try {
      const location = await storeLocationFromPostalCode(settings);
      storeCity = location.city;
      storeState = location.state;
    } catch (error) {
      response
        .status(409)
        .json({
          message:
            error instanceof Error ? error.message : "CEP da loja inválido.",
        });
      return;
    }
    const context = [storeCity, storeState].filter(Boolean).join(", ");
    const cacheKey = `${query}|${context}`.toLocaleLowerCase("pt-BR");
    const cached = locationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      response.json(cached.results);
      return;
    }
    if (Date.now() - lastLocationRequestAt < 1_000) {
      response.status(429).json({
        message: "Aguarde um instante antes de realizar outra busca.",
      });
      return;
    }
    lastLocationRequestAt = Date.now();
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set(
      "q",
      [query, context, "Brasil"].filter(Boolean).join(", "),
    );
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("limit", "8");
    url.searchParams.set("accept-language", "pt-BR");
    try {
      const upstream = await fetch(url, {
        headers: {
          "User-Agent": "UrFood-ERP/1.0 (delivery location search)",
          Accept: "application/json",
        },
      });
      if (!upstream.ok)
        throw new Error(
          `Serviço de localização indisponível (${upstream.status}).`,
        );
      const data = (await upstream.json()) as Array<{
        name?: string;
        addresstype?: string;
        type?: string;
        address?: Record<string, string>;
      }>;
      const seen = new Set<string>();
      const normalize = (value: string) =>
        value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("pt-BR")
          .trim();
      const results = data.flatMap((item) => {
        const address = item.address ?? {};
        const addressName =
          address.suburb ??
          address.neighbourhood ??
          address.quarter ??
          address.city_district ??
          "";
        const placeType = item.addresstype ?? item.type ?? "";
        const name =
          addressName ||
          ([
            "suburb",
            "neighbourhood",
            "quarter",
            "city_district",
            "residential",
            "village",
          ].includes(placeType)
            ? (item.name ?? "")
            : "");
        const city =
          address.city ??
          address.town ??
          address.municipality ??
          address.village ??
          "";
        const state =
          address["ISO3166-2-lvl4"]?.split("-").pop() ??
          address.state ??
          storeState;
        if (normalize(city) !== normalize(storeCity)) return [];
        if (
          /^[A-Za-z]{2}$/.test(state) &&
          state.toUpperCase() !== storeState.toUpperCase()
        )
          return [];
        const key = `${name}|${city}|${state}`.toLocaleLowerCase("pt-BR");
        if (!name || !city || seen.has(key)) return [];
        seen.add(key);
        return [{ name, city, state, label: `${name} · ${city} / ${state}` }];
      });
      locationCache.set(cacheKey, {
        expiresAt: Date.now() + 24 * 60 * 60_000,
        results,
      });
      response.json(results);
    } catch (error) {
      response.status(502).json({
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar localidades.",
      });
    }
  },
);

deliveryRouter.get("/config", async (_request, response) => {
  const settings = await getStoreSetting();
  const zones = await DeliveryZone.findAll({
    where: { active: true },
    attributes: [
      "id",
      "name",
      "fee",
      "estimatedMinutesMin",
      "estimatedMinutesMax",
      "minimumOrder",
    ],
    order: [["name", "ASC"]],
  });
  response.json({
    isOpen: await effectiveStoreStatus(settings),
    allowDelivery:
      Boolean(settings.getDataValue("allowDelivery")) && (hasFixedDeliveryFee(settings.getDataValue("fixedDeliveryFee")) || zones.length > 0),
    allowPickup: Boolean(settings.getDataValue("allowPickup")),
    minimumOrder: Number(settings.getDataValue("minimumOrder")),
    fixedDeliveryFee: settings.getDataValue("fixedDeliveryFee") === null ? null : Number(settings.getDataValue("fixedDeliveryFee")),
    averagePreparationMinutes: Number(
      settings.getDataValue("averagePreparationMinutes"),
    ),
    payments: paymentMethods(settings),
    zones,
  });
});

deliveryRouter.post("/quote", async (request, response) => {
  const settings = await getStoreSetting();
  if (!(await effectiveStoreStatus(settings))) {
    response.status(409).json({ message: "A loja está fechada no momento." });
    return;
  }
  if (!settings.getDataValue("allowDelivery")) {
    response
      .status(409)
      .json({ message: "A entrega está indisponível no momento." });
    return;
  }
  try {
    assertDeliveryLocality({ city: settings.getDataValue("city"), state: settings.getDataValue("state") }, request.body ?? {});
  } catch (error) {
    response.status(409).json({ message: error instanceof Error ? error.message : "Endereço fora da área de entrega." }); return;
  }
  const fixedFee = settings.getDataValue("fixedDeliveryFee");
  const isFixedDelivery = hasFixedDeliveryFee(fixedFee);
  const zone = isFixedDelivery ? null : await resolveDeliveryZone(request.body?.neighborhood);
  if (!isFixedDelivery && !zone) {
    response
      .status(404)
      .json({ message: "Ainda não entregamos neste bairro." });
    return;
  }
  const subtotal = Math.max(0, Number(request.body?.subtotal ?? 0));
  const minimumOrder = Math.max(
    Number(settings.getDataValue("minimumOrder")),
    Number(zone?.getDataValue("minimumOrder") ?? 0),
  );
  response.json({
    zoneId: zone?.getDataValue("id") ?? null,
    zoneName: zone?.getDataValue("name") ?? "Entrega local",
    fee: resolveDeliveryFee(fixedFee, zone?.getDataValue("fee") ?? 0),
    minimumOrder,
    estimatedMinutesMin: Number(zone?.getDataValue("estimatedMinutesMin") ?? settings.getDataValue("averagePreparationMinutes")),
    estimatedMinutesMax: Number(zone?.getDataValue("estimatedMinutesMax") ?? Number(settings.getDataValue("averagePreparationMinutes")) + 15),
    eligible: subtotal >= minimumOrder,
  });
});
