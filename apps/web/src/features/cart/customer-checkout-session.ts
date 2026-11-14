const normalizePhone = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return [12, 13].includes(digits.length) && digits.startsWith("55")
    ? digits.slice(2)
    : digits;
};
export function customerCheckoutHeaders(
  manual: boolean,
  phone: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): Record<string, string> {
  if (manual)
    return { Authorization: `Bearer ${storage.getItem("urfood_token") ?? ""}` };
  const token = storage.getItem("urfood_customer_token");
  if (!token) return {};
  try {
    const customer = JSON.parse(
      storage.getItem("urfood_customer") ?? "null",
    ) as { phone?: string } | null;
    return customer?.phone &&
      normalizePhone(customer.phone) === normalizePhone(phone)
      ? { Authorization: `Bearer ${token}` }
      : {};
  } catch {
    return {};
  }
}
