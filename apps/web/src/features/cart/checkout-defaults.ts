import { customerAddressFromProfile } from "../../utils/customer-address";
import type { CustomerAddress, CustomerDetails } from "../../types/customer";
export type CheckoutDefaults = {
  name: string;
  phone: string;
  address: Required<CustomerAddress>;
  fulfillmentType: "DELIVERY" | "PICKUP";
};
type StorageReader = Pick<Storage, "getItem">;
const canonicalPhone = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return [12, 13].includes(digits.length) && digits.startsWith("55")
    ? digits.slice(2)
    : digits;
};
const object = (value: string | null): Record<string, any> => {
  try {
    const parsed = JSON.parse(value ?? "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};
export function defaultsFromProfile(
  profile: Partial<CustomerDetails>,
): CheckoutDefaults {
  const orders = Array.isArray(profile.orders) ? profile.orders : [];
  const latest = [...orders].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
      Number(b.displayNumber) - Number(a.displayNumber),
  )[0];
  return {
    name: String(profile.name ?? ""),
    phone: canonicalPhone(profile.phone),
    address: customerAddressFromProfile({ address: profile.address, orders }),
    fulfillmentType:
      latest?.fulfillmentType === "PICKUP" ? "PICKUP" : "DELIVERY",
  };
}
export function readCheckoutDefaults(
  manual: boolean,
  storage: StorageReader = localStorage,
): CheckoutDefaults {
  const empty = defaultsFromProfile({});
  try {
    if (manual || !storage.getItem("urfood_customer_token")) return empty;
    const contact = object(storage.getItem("urfood_customer")),
      profile = object(storage.getItem("urfood_customer_profile"));
    const phone = canonicalPhone(contact.phone ?? profile.phone);
    if (!phone) return empty;
    const ownProfile = canonicalPhone(profile.phone) === phone ? profile : {};
    const defaults = defaultsFromProfile({ ...contact, ...ownProfile, phone });
    const last = object(storage.getItem("urfood_checkout_defaults"));
    if (canonicalPhone(last.phone) !== phone) return defaults;
    const serverLast = Date.parse(String(ownProfile.lastOrderAt ?? "")),
      cachedAt = Date.parse(String(last.savedAt ?? ""));
    if (
      Number.isFinite(serverLast) &&
      Number.isFinite(cachedAt) &&
      serverLast > cachedAt
    )
      return defaults;
    return {
      ...defaults,
      name: String(last.name || defaults.name),
      address: customerAddressFromProfile({
        address: { ...defaults.address, ...last.address },
        orders: [],
      }),
      fulfillmentType:
        last.fulfillmentType === "PICKUP" ? "PICKUP" : "DELIVERY",
    };
  } catch {
    return empty;
  }
}
export function rememberCheckoutDefaults(
  input: {
    manual?: boolean;
    customerName: string;
    customerPhone: string;
    fulfillmentType: "PICKUP" | "DELIVERY";
    address?: CustomerAddress;
    createdAt?: string;
  },
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  try {
    if (input.manual || !storage.getItem("urfood_customer_token")) return;
    const contact = object(storage.getItem("urfood_customer"));
    if (
      !contact.phone ||
      canonicalPhone(contact.phone) !== canonicalPhone(input.customerPhone)
    )
      return;
    const previous = readCheckoutDefaults(false, storage);
    storage.setItem(
      "urfood_checkout_defaults",
      JSON.stringify({
        name: input.customerName,
        phone: canonicalPhone(input.customerPhone),
        fulfillmentType: input.fulfillmentType,
        address: input.address ?? previous.address,
        savedAt: input.createdAt ?? new Date().toISOString(),
      }),
    );
  } catch {
    /* A preference cache must never prevent a successful order. */
  }
}
