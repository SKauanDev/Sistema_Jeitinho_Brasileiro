import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../../config/env.js";
import { createCardPayment, createPixPayment, findCheckoutProPayments, publicPixState } from "./mercado-pago.service.js";

function fakeOrder(method: "PIX" | "CREDIT_CARD" | "DEBIT_CARD") {
  const fields: Record<string, unknown> = { id: "11111111-1111-4111-8111-111111111111", displayNumber: 42, total: "31.50", createdAt: new Date(), paymentMethod: method, customerEmail: "cliente@example.test", customerDocument: "12345678901" };
  return {
    getDataValue: (name: string) => fields[name],
    update: async (changes: Record<string, unknown>) => { Object.assign(fields, changes); },
    fields,
  };
}

test("cartão: tentativas simultâneas não geram chaves de cobrança independentes", async () => {
  const previousFetch = globalThis.fetch; const originalToken = env.mercadoPagoAccessToken;
  (env as { mercadoPagoAccessToken: string }).mercadoPagoAccessToken = "TEST-fake";
  const keys: string[] = [];
  globalThis.fetch = async (url,init) => {
    if (String(url).endsWith("/v1/payment_methods")) return new Response(JSON.stringify([{id:"visa",payment_type_id:"credit_card"}]));
    keys.push((init?.headers as Record<string,string>)["X-Idempotency-Key"]!);
    return new Response(JSON.stringify({id:123,status:"pending"}),{status:201});
  };
  try {
    const input = {cardToken:"safe-token",paymentMethodId:"visa"};
    await Promise.all([createCardPayment(fakeOrder("CREDIT_CARD"),input,"client-attempt-a"),createCardPayment(fakeOrder("CREDIT_CARD"),input,"client-attempt-b")]);
    assert.equal(keys[0],keys[1]);
    const retry = fakeOrder("CREDIT_CARD"); retry.fields.paymentExternalId="previous-rejected-payment";
    await createCardPayment(retry,input,"client-attempt-c");
    assert.notEqual(keys[2],keys[0]);
  } finally { globalThis.fetch=previousFetch; (env as {mercadoPagoAccessToken:string}).mercadoPagoAccessToken=originalToken; }
});

test("Orders API gera Pix único com QR e email, sem documento", async () => {
  const previousFetch = globalThis.fetch;
  const originalToken = env.mercadoPagoAccessToken;
  const mutableEnv = env as { mercadoPagoAccessToken: string };
  mutableEnv.mercadoPagoAccessToken = "TEST-fake";
  const order = fakeOrder("PIX");
  let requestBody: Record<string, any> = {};
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/v1/orders"));
    assert.equal((init?.headers as Record<string, string>)["X-Idempotency-Key"], `urfood-pix-${order.fields.id}`);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "ORD12345", transactions: { payments: [{ id: "PAY123", status: "action_required", payment_method: { id: "pix", qr_code: "pix-code", qr_code_base64: "base64" } }] } }), { status: 201 });
  };
  try {
    await createPixPayment(order, "cliente@example.test");
    assert.equal(requestBody.total_amount, "31.50");
    assert.equal(requestBody.external_reference, order.fields.id);
    assert.equal(requestBody.transactions.payments[0].payment_method.id, "pix");
    assert.equal(requestBody.payer.email, "cliente@example.test");
    assert.equal(requestBody.payer.identification, undefined);
    assert.equal(requestBody.transactions.payments[0].expiration_time, "PT30M");
    assert.equal(order.fields.paymentProvider, "MERCADO_PAGO_ORDERS");
    assert.equal(order.fields.paymentExternalId, "ORD12345");
    assert.equal(order.fields.pixCopyPaste, "pix-code");
    assert.ok((order.fields.paymentExpiresAt as Date).getTime() - Date.now() <= 6 * 60_000);
  } finally {
    globalThis.fetch = previousFetch;
    mutableEnv.mercadoPagoAccessToken = originalToken;
  }
});

test("busca somente pagamentos Pix ou saldo do pedido e expõe link do Checkout Pro", async () => {
  const previousFetch = globalThis.fetch;
  const originalToken = env.mercadoPagoAccessToken;
  (env as { mercadoPagoAccessToken: string }).mercadoPagoAccessToken = "TEST-fake";
  const order = fakeOrder("PIX");
  order.fields.paymentCheckoutUrl = "https://www.mercadopago.com.br/checkout/v1/test";
  globalThis.fetch = async url => {
    assert.ok(String(url).includes("external_reference=11111111-1111-4111-8111-111111111111"));
    return new Response(JSON.stringify({ results: [
      { id: 1, external_reference: order.fields.id, payment_method_id: "pix" },
      { id: 2, external_reference: order.fields.id, payment_method_id: "visa" },
      { id: 3, external_reference: "other", payment_method_id: "pix" },
    ] }));
  };
  try {
    assert.deepEqual((await findCheckoutProPayments(order)).map(payment => payment.id), [1]);
    assert.equal(publicPixState(order).checkoutUrl, order.fields.paymentCheckoutUrl);
  } finally {
    globalThis.fetch = previousFetch;
    (env as { mercadoPagoAccessToken: string }).mercadoPagoAccessToken = originalToken;
  }
});

test("cartão usa token e valor no servidor, recusando método incompatível com débito", async () => {
  const previousFetch = globalThis.fetch;
  const originalToken = env.mercadoPagoAccessToken;
  const mutableEnv = env as { mercadoPagoAccessToken: string };
  mutableEnv.mercadoPagoAccessToken = "TEST-fake";
  const order = fakeOrder("DEBIT_CARD");
  let postCount = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/v1/payment_methods")) return new Response(JSON.stringify([{ id: "visa", payment_type_id: "credit_card" }, { id: "debvisa", payment_type_id: "debit_card" }]));
    postCount++;
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.transaction_amount, 31.5);
    assert.equal(payload.token, "safe-token");
    assert.equal(payload.payment_method_id, "debvisa");
    return new Response(JSON.stringify({ id: 999, status: "approved" }), { status: 201 });
  };
  try {
    const input = { cardToken: "safe-token", paymentMethodId: "visa", installments: 1, email: "cliente@example.test", document: "12345678901" };
    await assert.rejects(createCardPayment(order, input, "22222222-2222-4222-8222-222222222222"), /não corresponde/);
    assert.equal(postCount, 0);
    await createCardPayment(order, { ...input, paymentMethodId: "debvisa" }, "22222222-2222-4222-8222-222222222222");
    assert.equal(postCount, 1);
    assert.equal(order.fields.paymentExternalId, "999");
  } finally {
    globalThis.fetch = previousFetch;
    mutableEnv.mercadoPagoAccessToken = originalToken;
  }
});

test("crédito e débito usam parcela única e os dados do pagador salvos no pedido", async () => {
  const previousFetch = globalThis.fetch;
  const originalToken = env.mercadoPagoAccessToken;
  (env as { mercadoPagoAccessToken: string }).mercadoPagoAccessToken = "TEST-fake";
  const credit = fakeOrder("CREDIT_CARD");
  const debit = fakeOrder("DEBIT_CARD");
  const posted: Record<string, unknown>[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/v1/payment_methods")) return new Response(JSON.stringify([{ id: "visa", payment_type_id: "credit_card" }, { id: "debvisa", payment_type_id: "debit_card" }]));
    posted.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: 987, status: "pending" }), { status: 201 });
  };
  const base = { cardToken: "safe-token", email: "cliente@example.test", document: "12345678901" };
  try {
    await createCardPayment(credit, { ...base, paymentMethodId: "visa", installments: 3 }, "22222222-2222-4222-8222-222222222222");
    assert.equal(posted[0]?.installments, 1);
    assert.equal(posted[0]?.external_reference, credit.fields.id);
    assert.deepEqual(posted[0]?.payer, { email: "cliente@example.test", identification: { type: "CPF", number: "12345678901" } });
    await createCardPayment(debit, { ...base, paymentMethodId: "debvisa", installments: 2 }, "33333333-3333-4333-8333-333333333333");
    assert.equal(posted[1]?.installments, 1);
  } finally {
    globalThis.fetch = previousFetch;
    (env as { mercadoPagoAccessToken: string }).mercadoPagoAccessToken = originalToken;
  }
});
