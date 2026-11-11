import { warmPaymentStatus } from "./payment-refresh.js";
import { Router } from "express";
import type { Server } from "socket.io";
import { env } from "../../config/env.js";
import { Order } from "../../database/models.js";
import { expireUnpaidOrder } from "./payment-timeout.service.js";
import { createCardPayment, fetchAndReconcile, getMercadoPagoPayment, getMercadoPagoPixOrder, publicCardState, publicPixState, reconcilePayment, reconcilePixOrder } from "./mercado-pago.service.js";
import { validMercadoPagoWebhook } from "./mercado-pago-webhook.js";
import { requireOrderAccess } from "../../shared/order-access.middleware.js";

export const mercadoPagoRouter = Router();

mercadoPagoRouter.get("/public-key", (_request, response) => {
  response.json({ publicKey: env.mercadoPagoPublicKey });
});

mercadoPagoRouter.post("/webhook", async (request, response) => {
  const id = String(request.query["data.id"] ?? request.query.data_id ?? "");
  const type = String(request.query.type ?? "");
  if (!((type === "payment" && /^\d+$/.test(id)) || (type === "order" && /^[A-Z0-9_-]{8,100}$/i.test(id))) || !validMercadoPagoWebhook({
    secret: env.mercadoPagoWebhookSecret,
    dataId: id,
    requestId: String(request.header("x-request-id") ?? ""),
    signature: String(request.header("x-signature") ?? ""),
  })) {
    response.status(401).json({ message: "Notificação não autenticada." });
    return;
  }
  try {
    // Never trust the webhook's body as proof of payment; fetch the remote record.
    if (type === "order") await reconcilePixOrder(await getMercadoPagoPixOrder(id), request.app.get("io") as Server | undefined);
    else await reconcilePayment(await getMercadoPagoPayment(id), request.app.get("io") as Server | undefined);
    response.sendStatus(200);
  } catch (error) {
    console.error("Falha ao conciliar webhook Mercado Pago:", error);
    response.sendStatus(503);
  }
});

mercadoPagoRouter.get("/orders/:orderId", requireOrderAccess, async (request, response) => {
  const order = await Order.findByPk(String(request.params.orderId));
  if (!order || order.getDataValue("paymentMethod") !== "PIX") {
    response.status(404).json({ message: "Cobrança PIX não encontrada." }); return;
  }
  if (request.query.initial === "1" && order.getDataValue("pixCopyPaste")) {
    await expireUnpaidOrder(order, request.app.get("io") as Server | undefined);
    await order.reload();
    void warmPaymentStatus(order, request.app.get("io") as Server | undefined);
    response.json(publicPixState(order)); return;
  }
  let qrCodeBase64: string | undefined;
  try {
    if (order.getDataValue("paymentStatus") === "PENDING") {
      if (order.getDataValue("paymentProvider") === "MERCADO_PAGO" && order.getDataValue("paymentExternalId")) {
        const remote = await getMercadoPagoPayment(String(order.getDataValue("paymentExternalId")));
        await reconcilePayment(remote, request.app.get("io") as Server | undefined);
        qrCodeBase64 = remote.point_of_interaction?.transaction_data?.qr_code_base64;
      } else if (order.getDataValue("paymentProvider") === "MERCADO_PAGO_CHECKOUT_PRO" && order.getDataValue("paymentExternalId")) {
        await fetchAndReconcile(order, request.app.get("io") as Server | undefined);
      } else if (order.getDataValue("paymentProvider") === "MERCADO_PAGO_ORDERS" && order.getDataValue("paymentExternalId")) {
        const remote = await getMercadoPagoPixOrder(String(order.getDataValue("paymentExternalId")));
        await reconcilePixOrder(remote, request.app.get("io") as Server | undefined);
        qrCodeBase64 = remote.transactions?.payments?.[0]?.payment_method?.qr_code_base64;
      }
    }
  } catch (error) { console.error("Falha ao consultar PIX Mercado Pago:", error); }
  await expireUnpaidOrder(order, request.app.get("io") as Server | undefined);
  response.json(publicPixState(await order.reload(), qrCodeBase64));
});

mercadoPagoRouter.get("/card/orders/:orderId", requireOrderAccess, async (request, response) => {
  const order = await Order.findByPk(String(request.params.orderId));
  if (!order || !["CREDIT_CARD", "DEBIT_CARD"].includes(String(order.getDataValue("paymentMethod")))) {
    response.status(404).json({ message: "Pagamento com cartão não encontrado." }); return;
  }
  if (request.query.initial === "1") {
    await expireUnpaidOrder(order, request.app.get("io") as Server | undefined);
    await order.reload();
    void warmPaymentStatus(order, request.app.get("io") as Server | undefined);
    response.json(publicCardState(order)); return;
  }
  try {
    await expireUnpaidOrder(order, request.app.get("io") as Server | undefined);
    if (order.getDataValue("paymentExternalId") && order.getDataValue("paymentStatus") === "PENDING") {
      await fetchAndReconcile(order, request.app.get("io") as Server | undefined);
    }
  } catch (error) { console.error("Falha ao consultar cartão Mercado Pago:", error); }
  response.json(publicCardState(await order.reload()));
});

mercadoPagoRouter.post("/card/orders/:orderId", requireOrderAccess, async (request, response) => {
  const order = await Order.findByPk(String(request.params.orderId));
  if (!order || !["CREDIT_CARD", "DEBIT_CARD"].includes(String(order.getDataValue("paymentMethod")))) {
    response.status(404).json({ message: "Pagamento com cartão não encontrado." }); return;
  }
  if (order.getDataValue("paymentStatus") === "APPROVED") { response.json({ status: "approved" }); return; }
  await expireUnpaidOrder(order, request.app.get("io") as Server | undefined);
  if (order.getDataValue("status") === "CANCELED" || order.getDataValue("paymentStatus") === "EXPIRED") {
    response.status(409).json({ message: "Cancelado por falta de pagamento. Faça um novo pedido." }); return;
  }
  const attemptId = String(request.body?.attemptId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) { response.status(400).json({ message: "Tentativa de pagamento inválida." }); return; }
  try {
    if (order.getDataValue("paymentExternalId") && order.getDataValue("paymentStatus") === "PENDING") {
      await fetchAndReconcile(order, request.app.get("io") as Server | undefined);
      if (order.getDataValue("paymentStatus") === "PENDING") {
        response.status(409).json({ message: "Pagamento anterior ainda em análise. Aguarde a confirmação." }); return;
      }
      if (order.getDataValue("paymentStatus") === "APPROVED") { response.json({ status: "approved" }); return; }
    }
    const payment = await createCardPayment(order, request.body ?? {}, attemptId);
    await reconcilePayment(payment, request.app.get("io") as Server | undefined);
    response.json({ status: payment.status });
  } catch (error) {
    response.status(409).json({ message: error instanceof Error ? error.message : "Não foi possível processar o cartão." });
  }
});
