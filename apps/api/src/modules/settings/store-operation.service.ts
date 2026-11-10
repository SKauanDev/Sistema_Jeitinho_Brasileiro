import type { Transaction } from "sequelize";
import {
  DeliveryZone,
  StoreHour,
  StoreSetting,
} from "../../database/models.js";

const minutesOf = (time: unknown) => {
  const [rawHour, rawMinute] = String(time ?? "")
    .split(":")
    .map(Number);
  const hour = rawHour ?? Number.NaN;
  const minute = rawMinute ?? Number.NaN;
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : -1;
};

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
      storeName: "Pizzaria Borda Dourada",
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
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    values.weekday ?? "",
  );
  const minute = Number(values.hour ?? 0) * 60 + Number(values.minute ?? 0);
  const hours = await StoreHour.findAll({
    where: { storeSettingId: settings.getDataValue("id") },
    transaction,
  });
  if (!hours.length) return true;
  const today = hours.find(
    (item) => Number(item.getDataValue("dayOfWeek")) === day,
  );
  const previous = hours.find(
    (item) => Number(item.getDataValue("dayOfWeek")) === (day + 6) % 7,
  );
  const inside = (item: any, previousDay = false) => {
    if (!item || item.getDataValue("isClosed")) return false;
    const opens = minutesOf(item.getDataValue("opensAt"));
    const closes = minutesOf(item.getDataValue("closesAt"));
    if (opens < 0 || closes < 0) return false;
    if (closes > opens)
      return !previousDay && minute >= opens && minute < closes;
    return previousDay ? minute < closes : minute >= opens;
  };
  return inside(today) || inside(previous, true);
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
