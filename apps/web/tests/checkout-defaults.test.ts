import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultsFromProfile,
  readCheckoutDefaults,
  rememberCheckoutDefaults,
} from "../src/features/cart/checkout-defaults.ts";
const memory = (initial: Record<string, string>) => {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
};
const profile = {
  name: "Cliente QA",
  phone: "31999990000",
  address: {
    street: "Rua QA",
    number: "144",
    city: "Cidade QA",
    neighborhood: "Bairro QA",
    state: "MG",
    postalCode: "36000000",
    complement: "Fundos",
  },
  orders: [],
};

test("perfil com compra mais recente prevalece sobre a preferência local antiga", () => {
  const storage = memory({
    urfood_customer_token: "qa",
    urfood_customer: JSON.stringify({ phone: profile.phone }),
    urfood_customer_profile: JSON.stringify({ ...profile, lastOrderAt: "2026-11-14T15:00:00Z" }),
    urfood_checkout_defaults: JSON.stringify({ phone: profile.phone, name: "Nome antigo", address: { ...profile.address, number: "2" }, savedAt: "2026-11-13T15:00:00Z" }),
  });
  assert.equal(readCheckoutDefaults(false, storage).name, profile.name);
  assert.equal(readCheckoutDefaults(false, storage).address.number, "144");
});
test("checkout logado recupera nome, telefone e endereço completo; pedido manual e visitante não recebem dados de outro cliente", () => {
  const storage = memory({
    urfood_customer_token: "qa",
    urfood_customer: JSON.stringify({
      name: profile.name,
      phone: profile.phone,
    }),
    urfood_customer_profile: JSON.stringify(profile),
  });
  const defaults = readCheckoutDefaults(false, storage);
  assert.equal(defaults.name, profile.name);
  assert.equal(defaults.phone, profile.phone);
  assert.deepEqual(defaults.address, profile.address);
  assert.equal(readCheckoutDefaults(true, storage).name, "");
  assert.equal(
    readCheckoutDefaults(
      false,
      memory({ urfood_customer_profile: JSON.stringify(profile) }),
    ).address.street,
    "",
  );
  const other = memory({
    urfood_customer_token: "qa",
    urfood_customer: JSON.stringify({ phone: "11999990000" }),
    urfood_customer_profile: JSON.stringify(profile),
  });
  assert.equal(readCheckoutDefaults(false, other).address.street, "");
});
test("última compra logada é lembrada; pedido em nome de outro telefone não altera os padrões", () => {
  const storage = memory({
    urfood_customer_token: "qa",
    urfood_customer: JSON.stringify({
      name: profile.name,
      phone: profile.phone,
    }),
    urfood_customer_profile: JSON.stringify(profile),
  });
  rememberCheckoutDefaults(
    {
      customerName: "Nome atualizado",
      customerPhone: profile.phone,
      fulfillmentType: "DELIVERY",
      address: { ...profile.address, number: "200" },
    },
    storage,
  );
  assert.equal(readCheckoutDefaults(false, storage).name, "Nome atualizado");
  assert.equal(readCheckoutDefaults(false, storage).address.number, "200");
  rememberCheckoutDefaults(
    {
      customerName: "Outra pessoa",
      customerPhone: "11999990000",
      fulfillmentType: "PICKUP",
    },
    storage,
  );
  assert.equal(readCheckoutDefaults(false, storage).name, "Nome atualizado");
  assert.doesNotThrow(() =>
    rememberCheckoutDefaults(
      {
        customerName: profile.name,
        customerPhone: profile.phone,
        fulfillmentType: "PICKUP",
      },
      {
        ...storage,
        setItem() {
          throw Error("Quota");
        },
      },
    ),
  );
  const withDelivery = {
    ...profile,
    address: null,
    orders: [
      {
        fulfillmentType: "DELIVERY",
        createdAt: "2026-11-14T15:00:00Z",
        displayNumber: "144",
        status: "COMPLETED",
        ...profile.address,
      },
    ] as any,
  };
  assert.equal(defaultsFromProfile(withDelivery).address.number, "144");
});
