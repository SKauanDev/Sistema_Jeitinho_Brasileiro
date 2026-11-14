import assert from "node:assert/strict";
import test from "node:test";
import { customerCheckoutHeaders } from "../src/features/cart/customer-checkout-session.ts";
import { customerAddressFromProfile } from "../src/features/admin/customer-address.ts";
const storage = (entries: Record<string, string>) => ({
  getItem: (key: string) => entries[key] ?? null,
});
test("checkout vincula somente a sessão correspondente ao telefone, preserva convidado e separa login do admin", () => {
  const saved = storage({
    urfood_customer_token: "customer-token",
    urfood_token: "admin-token",
    urfood_customer: JSON.stringify({ phone: "+55 (31) 99999-0000" }),
  });
  assert.deepEqual(customerCheckoutHeaders(false, "31999990000", saved), {
    Authorization: "Bearer customer-token",
  });
  assert.deepEqual(customerCheckoutHeaders(false, "11999990000", saved), {});
  assert.deepEqual(customerCheckoutHeaders(true, "11999990000", saved), {
    Authorization: "Bearer admin-token",
  });
  assert.deepEqual(
    customerCheckoutHeaders(false, "31999990000", storage({})),
    {},
  );
});
test("endereço inicial usa o pedido de entrega mesmo quando o cadastro veio sem endereço ou com campos vazios", () => {
  const orders = [
    {
      id: "cancel",
      status: "CANCELED",
      fulfillmentType: "DELIVERY",
      createdAt: "2026-11-14T15:00:00Z",
      displayNumber: "97",
      street: "Rua cancelada",
      number: "97",
    },
    {
      id: "done",
      status: "COMPLETED",
      fulfillmentType: "DELIVERY",
      createdAt: "2026-11-13T15:00:00Z",
      displayNumber: "144",
      street: "Rua entrega",
      number: "144",
      city: "Cidade QA",
      state: "MG",
      postalCode: "36000000",
    },
  ] as any;
  assert.equal(
    customerAddressFromProfile({ orders, address: { street: "", number: "" } })
      .street,
    "Rua entrega",
  );
  assert.equal(customerAddressFromProfile({ orders }).number, "144");
  assert.equal(
    customerAddressFromProfile({ orders, address: { street: "Rua cadastro" } })
      .street,
    "Rua cadastro",
  );
  assert.equal(customerAddressFromProfile({ orders: [] }).street, "");
});
