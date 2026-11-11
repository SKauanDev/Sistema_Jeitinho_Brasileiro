import { PizzaValidationError } from "../catalog/pizza-sizes.js";
import { resolvePizzaConfiguration, type PizzaSelection, type PizzaProduct } from "./pizza-configuration.js";
import { Router } from "express";
import {
  Category,
  Option,
  Order,
  OrderItem,
  OrderItemOption,
  OrderStatusHistory,
  Product,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import type { Server } from "socket.io";
import { calculateCoupon } from "../promotions/coupon.service.js";
import { createPixPayment } from "../payments/mercado-pago.service.js";
import { applyOrderInventory, validateOrderInventory } from "../inventory/catalog-inventory.service.js";
import { Op, Transaction } from "sequelize";
import { orderQuantity } from "../inventory/stock-validation.js";
import { DIGITAL_SECURITY_FEE, orderTotal } from "./order-fees.js";
import { hasFixedDeliveryFee, resolveDeliveryFee } from "../delivery/delivery-fee.js";
import { expireUnpaidOrder, PAYMENT_TIMEOUT_MS } from "../payments/payment-timeout.service.js";
import { ADMIN_ROOM, orderTrackingToken } from "../../realtime/socket-security.js";
import { assertDeliveryLocality } from "../settings/delivery-locality.js";
import { requireOrderAccess } from "../../shared/order-access.middleware.js";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { resolveIdentity } from "../../realtime/socket-security.js";
import {
  effectiveStoreStatus,
  getStoreSetting,
  paymentMethods,
  resolveDeliveryZone,
} from "../settings/store-operation.service.js";

type OrderPayload = {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerDocument?: string;
  fulfillmentType?: "PICKUP" | "DELIVERY";
  address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    complement?: string;
    postalCode?: string;
  };
  deliveryFee?: number;
  paymentMethod?: "PIX" | "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "ONLINE";
  changeFor?: number;
  couponCode?: string;
  notes?: string;
  items?: Array<{
    size?: string;
    pizzaSelections?: PizzaSelection[];
    productId?: string;
    productName?: string;
    quantity?: number;
    unitPrice?: number;
    notes?: string;
    options?: Array<{
      optionId?: string;
      name?: string;
      group?: string;
      price?: number;
    }>;
  }>;
};

export const orderRouter = Router();

orderRouter.post("/", async (request, response) => {
  const payload = (request.body ?? {}) as OrderPayload;
  if (!Array.isArray(payload.items) || payload.items.length > 50 || payload.items.some(item => !item || typeof item !== "object" || (item.options !== undefined && (!Array.isArray(item.options) || item.options.length > 30 || item.options.some(option => !option || typeof option !== "object"))))) {
    response.status(400).json({ message: "Carrinho inválido ou muito grande." }); return;
  }
  if (payload.items.some(item => item.pizzaSelections !== undefined && (!Array.isArray(item.pizzaSelections) || item.pizzaSelections.length > 10 || item.pizzaSelections.some(pizza => !pizza || typeof pizza !== "object")))) { response.status(400).json({ message: "Sele??o de pizzas inv?lida." }); return; }
  if (
    !payload.customerName ||
    !payload.customerPhone ||
    !payload.fulfillmentType ||
    !payload.paymentMethod ||
    !payload.items?.length ||
    (["PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(payload.paymentMethod) && !payload.customerEmail) ||
    (["CREDIT_CARD", "DEBIT_CARD"].includes(payload.paymentMethod) && ![11, 14].includes(String(payload.customerDocument ?? "").replace(/\D/g, "").length))
  ) {
    response.status(400).json({ message: "Dados do pedido incompletos." });
    return;
  }
  if (
    payload.fulfillmentType === "DELIVERY" &&
    (!payload.address?.street ||
      !payload.address.number ||
      !payload.address.neighborhood ||
      !payload.address.city ||
      !payload.address.state ||
      String(payload.address.postalCode ?? "").replace(/\D/g, "").length !== 8)
  ) {
    response
      .status(400)
      .json({ message: "Preencha o endereço completo para entrega." });
    return;
  }

  try {
    let customerAccountId: string | null = null;
    const customerToken = request.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (customerToken) {
      try {
        const claims = jwt.verify(customerToken, env.jwtSecret, { algorithms: ["HS256"] });
        const identity = typeof claims === "string" ? null : await resolveIdentity(claims);
        if (!identity || identity.role !== "CUSTOMER" || identity.phone !== String(payload.customerPhone).replace(/\D/g, "")) throw new Error();
        customerAccountId = identity.sub!;
      } catch { response.status(401).json({ message: "Entre novamente no perfil para continuar o pedido." }); return; }
    }
    const settings = await getStoreSetting();
    if (!(await effectiveStoreStatus(settings)))
      throw new Error("A loja está fechada no momento.");
    if (
      payload.fulfillmentType === "DELIVERY" &&
      !settings.getDataValue("allowDelivery")
    )
      throw new Error("A entrega está indisponível no momento.");
    if (
      payload.fulfillmentType === "PICKUP" &&
      !settings.getDataValue("allowPickup")
    )
      throw new Error("A retirada está indisponível no momento.");
    const enabledPayments = paymentMethods(settings);
    const paymentAllowed =
      payload.paymentMethod === "PIX"
        ? enabledPayments.pix
        : payload.paymentMethod === "CASH"
          ? enabledPayments.cash
          : payload.paymentMethod === "ONLINE"
            ? enabledPayments.cardOnDelivery
            : ["CREDIT_CARD", "DEBIT_CARD"].includes(payload.paymentMethod)
              ? enabledPayments.onlineCard
              : false;
    if (!paymentAllowed)
      throw new Error("A forma de pagamento selecionada está indisponível.");
    if (payload.fulfillmentType === "DELIVERY") assertDeliveryLocality({ city: settings.getDataValue("city"), state: settings.getDataValue("state") }, payload.address ?? {});
    const result = await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async (transaction) => {
      const productIds = [...new Set(payload.items!.flatMap(item => [item.productId, ...(item.pizzaSelections ?? []).flatMap(pizza => [pizza.leftId, pizza.rightId])]).filter((id): id is string => Boolean(id)))];
      const optionIds = [...new Set(payload.items!.flatMap(item => (item.options ?? []).map(option => option.optionId)).filter((id): id is string => Boolean(id)))];
      // Two batched reads instead of one database round trip per product/additional.
      const products = await Product.findAll({ where: { id: { [Op.in]: productIds }, active: true, trashedAt: null }, include: [{ model: Category, as: "category", where: { active: true } }], transaction });
      const options = optionIds.length ? await Option.findAll({ where: { id: { [Op.in]: optionIds }, active: true }, transaction }) : [];
      const productsById = new Map(products.map(product => [String(product.getDataValue("id")), product]));
      const pizzaProducts = new Map(products.map(product => { const data = product.get({ plain: true }) as any; return [String(data.id), { ...data, category: data.category?.name ?? "" } as PizzaProduct]; }));
      const optionsById = new Map(options.map(option => [String(option.getDataValue("id")), option]));
      const normalizedItems = await Promise.all(
        payload.items!.map(async (item) => {
          if (!item.productId) throw new Error("Produto sem identificação.");
          const product = productsById.get(item.productId);
          if (!product)
            throw new Error("Um produto do carrinho não está mais disponível.");
          const quantity = orderQuantity(item.quantity);
          const configuration = resolvePizzaConfiguration(pizzaProducts.get(item.productId)!, item.size, item.pizzaSelections, pizzaProducts);
          const unitPrice = configuration.unitPrice;
          const normalizedOptions = await Promise.all(
            (item.options ?? []).filter(selected => selected.group !== "Tamanho" && (item.pizzaSelections === undefined || !/^Pizza \d+/.test(selected.group ?? ""))).map(async (selected) => {
              if (!selected.optionId) return { ...selected, price: 0 };
              const option = optionsById.get(selected.optionId);
              if (!option)
                throw new Error(
                  "Um adicional do carrinho não está mais disponível.",
                );
              return {
                ...selected,
                name: option.getDataValue("name"),
                price: Number(option.getDataValue("priceDelta")),
              };
            }),
          );
          normalizedOptions.push(...configuration.options);
          const optionsTotal = normalizedOptions.reduce(
            (sum, option) => sum + Math.max(0, Number(option.price ?? 0)),
            0,
          );
          return {
            ...item,
            productId: product.getDataValue("id"),
            productName: product.getDataValue("name"),
            options: normalizedOptions,
            quantity,
            unitPrice,
            optionsTotal,
            lineTotal: Number(
              ((unitPrice + optionsTotal) * quantity).toFixed(2),
            ),
          };
        }),
      );
      const subtotal = Number(
        normalizedItems
          .reduce((sum, item) => sum + item.lineTotal, 0)
          .toFixed(2),
      );
      await validateOrderInventory(normalizedItems, transaction);
      const fixedFee = settings.getDataValue("fixedDeliveryFee");
      const isFixedDelivery = hasFixedDeliveryFee(fixedFee);
      const zone =
        payload.fulfillmentType === "DELIVERY" && !isFixedDelivery
          ? await resolveDeliveryZone(
              payload.address?.neighborhood,
              transaction,
            )
          : null;
      if (payload.fulfillmentType === "DELIVERY" && !isFixedDelivery && !zone)
        throw new Error("Ainda não entregamos neste bairro.");
      const minimumOrder = Math.max(
        Number(settings.getDataValue("minimumOrder")),
        Number(zone?.getDataValue("minimumOrder") ?? 0),
      );
      if (subtotal < minimumOrder)
        throw new Error(
          `Pedido mínimo de R$ ${minimumOrder.toFixed(2).replace(".", ",")} para esta região.`,
        );
      const deliveryFee = payload.fulfillmentType === "DELIVERY" ? resolveDeliveryFee(fixedFee, zone?.getDataValue("fee") ?? 0) : 0;
      const couponResult = payload.couponCode
        ? await calculateCoupon(
            payload.couponCode,
            subtotal,
            transaction,
            true,
            payload.customerPhone,
          )
        : null;
      const discountAmount = couponResult?.discount ?? 0;
      const total = orderTotal(subtotal, deliveryFee, discountAmount);
      const order = await Order.create(
        {
          customerAccountId,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          customerEmail: payload.customerEmail ? String(payload.customerEmail).trim() : null,
          customerDocument: payload.customerDocument ? String(payload.customerDocument).replace(/\D/g, "") : null,
          fulfillmentType: payload.fulfillmentType,
          status: settings.getDataValue("autoAcceptOrders")
            ? "CONFIRMED"
            : "NEW",
          notes: payload.notes,
          street: payload.address?.street,
          number: payload.address?.number,
          neighborhood: payload.address?.neighborhood,
          city: payload.address?.city,
          state: payload.address?.state,
          complement: payload.address?.complement,
          postalCode: payload.address?.postalCode,
          subtotal,
          deliveryFee,
          digitalSecurityFee: DIGITAL_SECURITY_FEE,
          total,
          paymentMethod: payload.paymentMethod,
          paymentExpiresAt: ["PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(String(payload.paymentMethod)) ? new Date(Date.now() + PAYMENT_TIMEOUT_MS) : null,
          paymentStatus: ["PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(
            String(payload.paymentMethod),
          )
            ? "PENDING"
            : "NOT_REQUIRED",
          couponCode: couponResult?.code ?? null,
          discountAmount,
          changeFor:
            payload.paymentMethod === "CASH" &&
            Number(payload.changeFor) > total
              ? Number(payload.changeFor)
              : null,
        },
        { transaction },
      );
      if (couponResult)
        await couponResult.coupon.increment("usageCount", {
          by: 1,
          transaction,
        });

      for (const item of normalizedItems) {
        const orderItem = await OrderItem.create(
          {
            orderId: order.getDataValue("id"),
            productId: item.productId,
            productName: item.productName ?? "Produto",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            optionsTotal: item.optionsTotal,
            lineTotal: item.lineTotal,
            notes: item.notes,
          },
          { transaction },
        );
        for (const option of item.options ?? []) {
          await OrderItemOption.create(
            {
              orderItemId: orderItem.getDataValue("id"),
              optionId: option.optionId ?? null,
              optionName: option.name ?? "Opção",
              optionGroupName: option.group ?? "Personalização",
              priceDelta: Math.max(0, Number(option.price ?? 0)),
              quantity: 1,
            },
            { transaction },
          );
        }
      }
      await OrderStatusHistory.create(
        {
          orderId: order.getDataValue("id"),
          status: order.getDataValue("status"),
        },
        { transaction },
      );
      if (
        !["PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(
          String(payload.paymentMethod),
        )
      )
        await applyOrderInventory(
          String(order.getDataValue("id")),
          transaction,
        );
      return order;
    });
    if (payload.paymentMethod === "PIX")
      try {
        await createPixPayment(result, String(payload.customerEmail));
      } catch (error) {
        await result.update({
          status: "CANCELED",
          paymentStatus: "REJECTED",
          cancellationReason: "Não foi possível gerar a cobrança PIX.",
        });
        throw error;
      }
    const paymentPath =
      payload.paymentMethod === "PIX"
        ? "pix"
        : ["CREDIT_CARD", "DEBIT_CARD"].includes(payload.paymentMethod)
          ? "cartao"
          : null;
    const event = {
      id: result.getDataValue("id"),
      displayNumber: result.getDataValue("displayNumber"),
      status: result.getDataValue("status"),
      createdAt: result.getDataValue("createdAt"),
      requiresPayment: Boolean(paymentPath),
      paymentPath,
    };
    response.status(201).json({ ...event, trackingToken: orderTrackingToken(String(result.getDataValue("id"))) });
    if (!paymentPath)
      (request.app.get("io") as Server | undefined)?.to(ADMIN_ROOM).emit("order:new", event);
    else (request.app.get("io") as Server | undefined)?.to(ADMIN_ROOM).emit("order:updated", event);
  } catch (error) {
    console.error("Falha ao criar pedido:", error);
    const detail = error instanceof Error ? error.message : "";
    const invalidPizza = error instanceof PizzaValidationError;
    const operational = [
      "loja está fechada",
      "indisponível",
      "não entregamos",
      "Pedido mínimo",
    ].some((message) => detail.includes(message));
    const expected =
      detail.includes("não está mais disponível") ||
      detail.includes("sem identificação") ||
      detail.includes("cupom") ||
      detail.includes("Cupom") ||
      detail.includes("Estoque insuficiente") ||
      detail.includes("Quantidade inválida") ||
      detail.includes("cidade e UF") ||
      detail.includes("Pedido mínimo");
    const paymentFailure = ["PIX", "CREDIT_CARD", "DEBIT_CARD"].includes(
      String(payload.paymentMethod),
    );
    const message =
      expected || operational || invalidPizza
        ? detail
        : paymentFailure && detail
          ? `Falha no pagamento: ${detail}`
          : "Não foi possível registrar o pedido.";
    response
      .status(invalidPizza ? 400 : expected || operational ? 409 : paymentFailure ? 502 : 500)
      .json({ message });
  }
});

orderRouter.get("/:id", requireOrderAccess, async (request, response) => {
  const current = await Order.findByPk(String(request.params.id));
  if (current) await expireUnpaidOrder(current, request.app.get("io") as Server | undefined);
  const order = await Order.findByPk(String(request.params.id), {
    include: [{ model: OrderStatusHistory, as: "statusHistory" }, { model: OrderItem, as: "items", include: [{ model: OrderItemOption, as: "selectedOptions" }] }],
  });
  if (!order) {
    response.status(404).json({ message: "Pedido não encontrado." });
    return;
  }
  response.json(order);
});
