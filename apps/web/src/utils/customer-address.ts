import type { CustomerAddress, CustomerDetails } from "../types/customer";
const keys = [
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
  "postalCode",
  "complement",
] as const;
export function customerAddressFromProfile(
  customer: Pick<CustomerDetails, "address" | "orders">,
): Required<CustomerAddress> {
  const deliveries = [...customer.orders]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        Number(b.displayNumber) - Number(a.displayNumber),
    )
    .filter(
      (order) =>
        order.fulfillmentType === "DELIVERY" &&
        String(order.street ?? "").trim(),
    );
  const latest =
    deliveries.find((order) => order.status !== "CANCELED") ?? deliveries[0];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      String(customer.address?.[key] ?? "").trim() ||
        String(latest?.[key] ?? "").trim(),
    ]),
  ) as Required<CustomerAddress>;
}
