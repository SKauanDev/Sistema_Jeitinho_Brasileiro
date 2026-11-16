import { isWithinOpeningHours, type OpeningHour } from "./store-hours.js";
import type { Transaction } from "sequelize";
import {
  DeliveryZone,
  StoreHour,
  StoreSetting,
} from "../../database/models.js";

export const normalizeRegion = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export async function getStoreSetting(transaction?: Transaction) {
  const [setting] = await StoreSetting.findOrCreate({
    where: {},
    defaults: {
      storeName: "Pizzaria Jeitinho Brasileiro",
      isOpen: true,
      averagePreparationMinutes: 30,
    },
    transaction,
  });
  return setting;
}

export async function effectiveStoreStatus(
  settings: any,
  transaction?: Transaction,
) {
  if (!settings.getDataValue("isOpen")) return false;
  const hours = await StoreHour.findAll({
    where: { storeSettingId: settings.getDataValue("id") },
    transaction,
  });
  return isWithinOpeningHours(
    hours.map((hour) => hour.get({ plain: true }) as OpeningHour),
  );
}

export async function resolveDeliveryZone(
  neighborhood: unknown,
  transaction?: Transaction,
) {
  const wanted = normalizeRegion(neighborhood);
  if (!wanted) return null;
  const zones = await DeliveryZone.findAll({
    where: { active: true },
    transaction,
  });
  return (
    zones.find(
      (zone) => normalizeRegion(zone.getDataValue("name")) === wanted,
    ) ?? null
  );
}

export function paymentMethods(settings: any) {
  return {
    pix: Boolean(settings.getDataValue("pixEnabled")),
    cash: Boolean(settings.getDataValue("cashEnabled")),
    cardOnDelivery: Boolean(settings.getDataValue("cardOnDeliveryEnabled")),
    onlineCard: Boolean(settings.getDataValue("onlinePaymentEnabled")),
  };
}
