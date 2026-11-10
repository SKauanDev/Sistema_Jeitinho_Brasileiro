import { Op } from "sequelize";
import type { Server } from "socket.io";
import { env } from "../../config/env.js";
import { FinancialEntry, Order, OrderStatusHistory } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { ADMIN_ROOM } from "../../realtime/socket-security.js";
import { applyOrderInventory } from "../inventory/catalog-inventory.service.js";
import { expireUnpaidOrder, paymentDeadline } from "./payment-timeout.service.js";

export type MercadoPagoPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  date_approved?: string;
  payment_method_id?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};

export type MercadoPagoPixOrder = {
  id: string;
  external_reference?: string;
  status: string;
  total_amount?: string;
  total_paid_amount?: string;
  transactions?: { payments?: Array<{ id: string; status: string; amount?: string; paid_amount?: string; payment_method?: { id: string; qr_code?: string; qr_code_base64?: string } }> };
};

const api = "https://api.mercadopago.com";
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const entryDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export async function mercadoPagoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!env.mercadoPagoAccessToken) throw new Error("Configure MERCADO_PAGO_ACCESS_TOKEN na API.");
  const response = await fetch(`${api}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${env.mercadoPagoAccessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const raw = await response.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) {
    const cause = Array.isArray(data.cause) ? data.cause.map((item: any) => item.description ?? item.code).filter(Boolean).join("; ") : "";
    const detail = [data.error, data.message, cause].filter(Boolean).join(": ");
    console.error("Mercado Pago rejeitou a requisição", { status: response.status, error: data.error, message: data.message, cause: data.cause });
    throw new Error(detail || `Mercado Pago recusou a requisição (${response.status}).`);
  }
  return data as T;
}

function payer(email: string, document: string) {
  const identifier = digits(document);
  if (![11, 14].includes(identifier.length)) throw new Error("Informe um CPF ou CNPJ válido para o pagamento.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido para o pagamento.");
  return { email, identification: { type: identifier.length === 14 ? "CNPJ" : "CPF", number: identifier } };
}

export async function createPixPayment(order: any, email: string) {
  const id = String(order.getDataValue("id"));
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido para gerar o PIX.");
  const amount = Number(order.getDataValue("total")).toFixed(2);
  const remote = await mercadoPagoRequest<MercadoPagoPixOrder>("/v1/orders", {
    method: "POST",
    headers: { "X-Idempotency-Key": `urfood-pix-${id}` },
    body: JSON.stringify({
      type: "online",
      total_amount: amount,
      external_reference: id,
      processing_mode: "automatic",
      transactions: { payments: [{ amount, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: "PT30M" }] },
      payer: { email },
    }),
  });
  const payment = remote.transactions?.payments?.[0];
  const copyPaste = payment?.payment_method?.qr_code;
  if (!remote.id || !copyPaste || payment?.payment_method?.id !== "pix") throw new Error("O Mercado Pago não retornou o PIX Copia e Cola.");
  await order.update({
    paymentStatus: "PENDING",
    paymentProvider: "MERCADO_PAGO_ORDERS",
    paymentExternalId: String(remote.id),
    pixCopyPaste: copyPaste,
    pixQrCodeBase64: payment.payment_method?.qr_code_base64 ?? null,
    paymentExpiresAt: paymentDeadline(order),
  });
  return order;
}

export const getMercadoPagoPixOrder = (id: string) => mercadoPagoRequest<MercadoPagoPixOrder>(`/v1/orders/${encodeURIComponent(id)}`);
export const cancelMercadoPagoPixOrder = (id: string) => mercadoPagoRequest<unknown>(`/v1/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });

export async function reconcilePixOrder(remote: MercadoPagoPixOrder, io?: Server) {
  const order = await Order.findOne({ where: { paymentProvider: "MERCADO_PAGO_ORDERS", paymentExternalId: remote.id, paymentMethod: "PIX" } });
  const payment = remote.transactions?.payments?.[0];
  if (!order || !payment || remote.external_reference !== String(order.getDataValue("id")) || payment.payment_method?.id !== "pix") return null;
  const approved = remote.status === "processed" && payment.status === "processed";
  const rejected = ["canceled", "cancelled", "failed", "expired"].includes(remote.status);
  if (!approved && !rejected) return order;
  const amount = Number(approved ? remote.total_paid_amount ?? payment.paid_amount : remote.total_amount ?? payment.amount);
  return reconcilePayment({
    id: payment.id,
    status: approved ? "approved" : "cancelled",
    external_reference: remote.external_reference,
    transaction_amount: amount,
    payment_method_id: "pix",
  }, io);
}

export async function findCheckoutProPayments(order: any) {
  const id = String(order.getDataValue("id"));
  const results = await mercadoPagoRequest<{ results?: MercadoPagoPayment[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(id)}&limit=10`);
  return (results.results ?? []).filter(payment => payment.external_reference === id && ["pix", "account_money"].includes(payment.payment_method_id ?? ""));
}

export async function createCardPayment(order: any, input: Record<string, unknown>, _attemptId: string) {
  const token = String(input.cardToken ?? "");
  const method = String(input.paymentMethodId ?? "");
  const installments = 1;
  const email = String(order.getDataValue("customerEmail") ?? "").trim();
  const document = String(order.getDataValue("customerDocument") ?? "");
  if (!token || !/^[a-z0-9_-]{2,50}$/i.test(method) || !Number.isInteger(installments) || installments < 1 || installments > 12) {
    throw new Error("Dados do cartão incompletos ou inválidos.");
  }
  const methods = await mercadoPagoRequest<Array<{ id: string; payment_type_id: string }>>("/v1/payment_methods");
  const expectedKind = order.getDataValue("paymentMethod") === "DEBIT_CARD" ? "debit_card" : "credit_card";
  if (!methods.some(item => item.id === method && item.payment_type_id === expectedKind) || (expectedKind === "debit_card" && installments !== 1)) {
    throw new Error("O cartão selecionado não corresponde à forma de pagamento do pedido.");
  }
  const payment = await mercadoPagoRequest<MercadoPagoPayment>("/v1/payments", {
    method: "POST",
    // Concurrent browser tabs share one provider attempt; a rejected payment ID
    // opens the next retry without trusting a client-generated idempotency key.
    headers: { "X-Idempotency-Key": `urfood-card-${order.getDataValue("id")}-${order.getDataValue("paymentExternalId") ?? "initial"}` },
    body: JSON.stringify({
      transaction_amount: Number(order.getDataValue("total")),
      description: `Pedido #${order.getDataValue("displayNumber")} - UrFood`,
      external_reference: String(order.getDataValue("id")),
      token,
      payment_method_id: method,
      installments,
      ...(input.issuerId ? { issuer_id: String(input.issuerId) } : {}),
      payer: payer(email, document),
      ...(env.apiPublicUrl ? { notification_url: `${env.apiPublicUrl.replace(/\/$/, "")}/payments/mercado-pago/webhook` } : {}),
    }),
  });
  if (!payment.id) throw new Error("O Mercado Pago não retornou o identificador do pagamento.");
  await order.update({ paymentStatus: "PENDING", paymentProvider: "MERCADO_PAGO", paymentExternalId: String(payment.id) });
  return payment;
}

export const getMercadoPagoPayment = (id: string) => mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(id)}`);

export async function cancelMercadoPagoPayment(id: string) {
  const remote = await getMercadoPagoPayment(id);
  if (!["pending", "in_process", "authorized"].includes(remote.status)) return remote;
  return mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
}

async function cancelRejectedPix(order: any, io?: Server) {
  await sequelize.transaction(async transaction => {
    await order.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (order.getDataValue("status") === "CANCELED" || order.getDataValue("paymentStatus") !== "PENDING") return;
    await order.update({ status: "CANCELED", paymentStatus: "REJECTED", cancellationReason: "Pagamento PIX recusado ou cancelado." }, { transaction });
    await OrderStatusHistory.create({ orderId: order.getDataValue("id"), status: "CANCELED" }, { transaction });
  });
  const event = { id: order.getDataValue("id"), status: "CANCELED", paymentStatus: "REJECTED" };
  io?.to(ADMIN_ROOM).emit("order:updated", event);
  io?.to(`order:${event.id}`).emit("order:payment", event);
}

export async function reconcilePayment(remote: MercadoPagoPayment, io?: Server) {
  const paymentId = String(remote.id);
  let order = await Order.findOne({ where: { paymentProvider: "MERCADO_PAGO", paymentExternalId: paymentId } });
  if (!order && remote.external_reference && ["pix", "account_money"].includes(remote.payment_method_id ?? "")) {
    order = await Order.findOne({ where: { id: remote.external_reference, paymentProvider: { [Op.in]: ["MERCADO_PAGO_CHECKOUT_PRO", "MERCADO_PAGO_ORDERS"] }, paymentMethod: "PIX" } });
  }
  if (!order || (remote.external_reference && remote.external_reference !== String(order.getDataValue("id")))) return null;
  const expected = Number(order.getDataValue("total"));
  if (!Number.isFinite(Number(remote.transaction_amount)) || Math.abs(Number(remote.transaction_amount) - expected) > 0.001) {
    console.error("Valor divergente no pagamento Mercado Pago", { paymentId, orderId: order.getDataValue("id") });
    return null;
  }
  await expireUnpaidOrder(order, io);
  if (remote.status === "approved" && order.getDataValue("paymentStatus") !== "APPROVED") {
    const newlyConfirmed = await sequelize.transaction(async transaction => {
      await order.reload({ transaction, lock: transaction.LOCK.UPDATE });
      if (order.getDataValue("paymentStatus") === "APPROVED") return false;
      await order.update({ paymentStatus: "APPROVED", paidAt: remote.date_approved ? new Date(remote.date_approved) : new Date() }, { transaction });
      const canceled = order.getDataValue("status") === "CANCELED";
      await FinancialEntry.findOrCreate({
        where: { sourceId: `MERCADO_PAGO:${paymentId}` },
        defaults: {
          type: "IN",
          category: order.getDataValue("paymentMethod") === "PIX" ? (remote.payment_method_id === "account_money" ? "Venda saldo Mercado Pago" : "Venda PIX") : "Venda Cartão",
          description: `Pagamento do pedido #${order.getDataValue("displayNumber")}`,
          amount: order.getDataValue("total"),
          entryDate: entryDate(),
          notes: canceled ? "Pagamento recebido após cancelamento. Revisar estorno; pedido não liberado para preparo." : "Pagamento confirmado automaticamente pelo Mercado Pago",
          createdBy: "Mercado Pago",
          sourceId: `MERCADO_PAGO:${paymentId}`,
        }, transaction,
      });
      if (!canceled) await applyOrderInventory(String(order.getDataValue("id")), transaction);
      return true;
    });
    if (!newlyConfirmed) return order.reload();
    const event = { id: order.getDataValue("id"), displayNumber: order.getDataValue("displayNumber"), status: order.getDataValue("status"), createdAt: order.getDataValue("createdAt") };
    io?.to(ADMIN_ROOM).emit(order.getDataValue("status") === "CANCELED" ? "order:updated" : "order:new", event);
    io?.to(`order:${event.id}`).emit("order:payment", { id: event.id, paymentStatus: "APPROVED" });
  } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(remote.status) && order.getDataValue("paymentStatus") === "PENDING") {
    if (order.getDataValue("paymentMethod") === "PIX") await cancelRejectedPix(order, io);
    else await order.update({ paymentStatus: "REJECTED" });
  }
  return order.reload();
}

export async function fetchAndReconcile(order: any, io?: Server) {
  const id = order.getDataValue("paymentExternalId");
  if (order.getDataValue("paymentProvider") === "MERCADO_PAGO_CHECKOUT_PRO" && id) {
    const payments = await findCheckoutProPayments(order);
    for (const payment of payments) await reconcilePayment(payment, io);
    return order.reload();
  }
  if (order.getDataValue("paymentProvider") === "MERCADO_PAGO_ORDERS" && id) return reconcilePixOrder(await getMercadoPagoPixOrder(String(id)), io);
  if (order.getDataValue("paymentProvider") !== "MERCADO_PAGO" || !id) return order;
  return reconcilePayment(await getMercadoPagoPayment(String(id)), io);
}

export async function reconcilePendingPayments(io?: Server) {
  const active = await Order.findAll({ where: {
    paymentMethod: { [Op.in]: ["PIX", "CREDIT_CARD", "DEBIT_CARD"] },
    paymentProvider: { [Op.in]: ["MERCADO_PAGO", "MERCADO_PAGO_CHECKOUT_PRO", "MERCADO_PAGO_ORDERS"] }, paymentStatus: "PENDING",
    paymentExternalId: { [Op.ne]: null }, paymentExpiresAt: { [Op.gt]: new Date() },
  } });
  // Limit concurrent external requests to avoid API throttling.
  for (let offset = 0; offset < active.length; offset += 5) {
    await Promise.all(active.slice(offset, offset + 5).map(order => fetchAndReconcile(order, io).catch(error =>
      console.warn(`Falha temporária ao conciliar pagamento ${order.getDataValue("id")}:`, error instanceof Error ? error.message : error))));
  }
}

export function publicPixState(order: any, qrCodeBase64?: string) {
  return {
    orderId: order.getDataValue("id"), displayNumber: order.getDataValue("displayNumber"),
    total: Number(order.getDataValue("total")), paymentStatus: order.getDataValue("paymentStatus"),
    orderStatus: order.getDataValue("status"), cancellationReason: order.getDataValue("cancellationReason"),
    expiresAt: paymentDeadline(order), pixCopyPaste: order.getDataValue("pixCopyPaste"),
    pixKey: null, qrCodeBase64: qrCodeBase64 ?? order.getDataValue("pixQrCodeBase64"), checkoutUrl: order.getDataValue("paymentCheckoutUrl"),
  };
}

export function publicCardState(order: any) {
  return {
    orderId: order.getDataValue("id"), displayNumber: order.getDataValue("displayNumber"),
    total: Number(order.getDataValue("total")), paymentStatus: order.getDataValue("paymentStatus"),
    orderStatus: order.getDataValue("status"), cancellationReason: order.getDataValue("cancellationReason"),
    expiresAt: paymentDeadline(order), paymentMethod: order.getDataValue("paymentMethod"),
    customerName: order.getDataValue("customerName"),
  };
}
