import { isDeveloper } from "../../shared/developer.middleware.js";
import { isCounterPayment } from "../orders/payment-policy.js";
import { Op, QueryTypes } from "sequelize";
import { Router } from "express";
import type { Server } from "socket.io";
import {
  Order,
  OrderItem,
  OrderItemOption,
  OrderStatusHistory,
  StoreHour,
  StoreSetting,
  DiningSession,
  DiningTable,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { ADMIN_ROOM } from "../../realtime/socket-security.js";
import { requireAdminArea, requireAuth } from "../../shared/auth.middleware.js";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  type OrderStatus,
} from "../orders/order.constants.js";
import {
  applyOrderInventory,
  revertOrderInventory,
} from "../inventory/catalog-inventory.service.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdminArea);

function periodRange(period: string, customStart?: string, customEnd?: string) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  if (period === "custom" && customStart && customEnd) {
    start = new Date(`${customStart}T00:00:00`);
    end.setTime(new Date(`${customEnd}T23:59:59.999`).getTime());
  } else if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (period === "7d") start.setDate(start.getDate() - 7);
  else if (period === "30d") start.setDate(start.getDate() - 30);
  else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "previous_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end.setTime(
      new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime(),
    );
  } else {
    start.setHours(0, 0, 0, 0);
  }
  const duration = end.getTime() - start.getTime();
  return {
    start,
    end,
    previousStart: new Date(start.getTime() - duration),
    previousEnd: new Date(start.getTime()),
  };
}

const number = (value: unknown) => Number(value ?? 0);
const trend = (current: number, previous: number) =>
  previous === 0
    ? current > 0
      ? 100
      : 0
    : Number((((current - previous) / previous) * 100).toFixed(1));
const minutesOf = (time: unknown) => {
  const parts = String(time ?? "")
    .split(":")
    .map(Number);
  const hour = parts[0] ?? Number.NaN;
  const minute = parts[1] ?? Number.NaN;
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : -1;
};
async function effectiveStoreStatus(settings: any) {
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
  });
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

adminRouter.get("/dashboard", async (request, response) => {
  const { start, end, previousStart, previousEnd } = periodRange(
    String(request.query.period ?? "today"),
    String(request.query.start ?? ""),
    String(request.query.end ?? ""),
  );
  const [orders, previousOrders, recentOrders, products, customerMetrics] =
    await Promise.all([
      Order.findAll({
        where: { createdAt: { [Op.between]: [start, end] } },
        order: [["createdAt", "ASC"]],
      }),
      Order.findAll({
        where: { createdAt: { [Op.between]: [previousStart, previousEnd] } },
      }),
      Order.findAll({ limit: 8, order: [["createdAt", "DESC"]] }),
      sequelize.query<{
        productName: string;
        quantity: string;
        revenue: string;
      }>(
        "SELECT oi.product_name AS productName, SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS revenue FROM order_items oi INNER JOIN orders o ON o.id = oi.order_id WHERE o.created_at BETWEEN :start AND :end AND o.status = 'COMPLETED' GROUP BY oi.product_name ORDER BY quantity DESC LIMIT 5",
        { replacements: { start, end }, type: QueryTypes.SELECT },
      ),
      sequelize.query<{ newCustomers: string; returningCustomers: string }>(
        "SELECT SUM(first_order BETWEEN :start AND :end) AS newCustomers, SUM(first_order < :start) AS returningCustomers FROM (SELECT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') AS phone, MIN(created_at) AS first_order FROM orders GROUP BY phone) customers WHERE EXISTS (SELECT 1 FROM orders current_orders WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(current_orders.customer_phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '') = customers.phone AND current_orders.created_at BETWEEN :start AND :end)",
        { replacements: { start, end }, type: QueryTypes.SELECT },
      ),
    ]);
  const plain = orders.map(
    (item) => item.get({ plain: true }) as Record<string, unknown>,
  );
  const previous = previousOrders.map(
    (item) => item.get({ plain: true }) as Record<string, unknown>,
  );
  const completed = plain.filter((order) => order.status === "COMPLETED");
  const previousCompleted = previous.filter(
    (order) => order.status === "COMPLETED",
  );
  const revenue = completed.reduce(
    (sum, order) => sum + number(order.total),
    0,
  );
  const previousRevenue = previousCompleted.reduce(
    (sum, order) => sum + number(order.total),
    0,
  );
  const days = new Map<
    string,
    { date: string; revenue: number; orders: number }
  >();
  plain.forEach((order) => {
    const date = new Date(String(order.createdAt)).toISOString().slice(0, 10);
    const value = days.get(date) ?? { date, revenue: 0, orders: 0 };
    value.orders += 1;
    if (order.status === "COMPLETED") value.revenue += number(order.total);
    days.set(date, value);
  });
  const paymentLabels: Record<string, string> = {
    PIX: "PIX",
    CASH: "Dinheiro",
    CREDIT_CARD: "Cartão de crédito",
    DEBIT_CARD: "Cartão de débito",
    ONLINE: "Cartão na entrega",
  };
  const payments = new Map<string, number>();
  completed.forEach((order) => {
    const method = String(order.paymentMethod ?? "NOT_INFORMED");
    payments.set(method, (payments.get(method) ?? 0) + number(order.total));
  });
  response.json({
    period: { start, end },
    kpis: {
      revenue,
      revenueTrend: trend(revenue, previousRevenue),
      orders: plain.length,
      ordersTrend: trend(plain.length, previous.length),
      averageTicket: completed.length ? revenue / completed.length : 0,
      inProgress: plain.filter(
        (order) => !["COMPLETED", "CANCELED"].includes(String(order.status)),
      ).length,
    },
    secondary: {
      completed: completed.length,
      canceled: plain.filter((o) => o.status === "CANCELED").length,
      delivery: plain.filter((o) => o.fulfillmentType === "DELIVERY").length,
      pickup: plain.filter((o) => o.fulfillmentType === "PICKUP").length,
      newCustomers: number(customerMetrics[0]?.newCustomers),
      returningCustomers: number(customerMetrics[0]?.returningCustomers),
    },
    chart: [...days.values()],
    products: products.map((item) => ({
      ...item,
      quantity: number(item.quantity),
      revenue: number(item.revenue),
    })),
    paymentMethods: [...payments].map(([method, value]) => ({
      name: paymentLabels[method] ?? "Não informado",
      value,
      percentage: revenue ? Number(((value / revenue) * 100).toFixed(1)) : 0,
    })),
    categories: [],
    recentOrders: recentOrders.map((item) => item.get({ plain: true })),
  });
});

adminRouter.get("/orders/store", async (_request, response) => {
  const setting = await StoreSetting.findOne();
  const fields = ["storeName", "averagePreparationMinutes", "phone", "street", "number", "complement", "neighborhood", "city", "state", "postalCode", "pixKey"];
  response.json(Object.fromEntries(fields.map(key => [key, setting?.getDataValue(key)])));
});

adminRouter.get("/orders", async (_request, response) => {
  const orders = await Order.findAll({
    include: [
      {
        model: OrderItem,
        as: "items",
        include: [{ model: OrderItemOption, as: "selectedOptions" }],
      },
      { model: OrderStatusHistory, as: "statusHistory" },
    ],
    order: [["createdAt", "DESC"]],
    limit: 200,
  });
  const developer = isDeveloper(response.locals.user);
  response.json(orders.map(order => ({ ...order.get({ plain: true }), canDelete: developer && ["COMPLETED", "CANCELED"].includes(String(order.getDataValue("status"))) })));
});

adminRouter.patch("/orders/:id/status", async (request, response) => {
  const status = request.body.status as OrderStatus;
  const reason = String(request.body.reason ?? "").trim();
  if (!ORDER_STATUSES.includes(status)) {
    response.status(400).json({ message: "Status inválido." });
    return;
  }
  const order = await Order.findByPk(request.params.id);
  if (!order) {
    response.status(404).json({ message: "Pedido não encontrado." });
    return;
  }
  const current = String(order.getDataValue("status")) as OrderStatus;
  if (status !== "CANCELED" && !isCounterPayment(order.getDataValue("paymentMethod"), order.getDataValue("paymentProvider")) && !["NOT_REQUIRED", "APPROVED"].includes(String(order.getDataValue("paymentStatus")))) {
    response.status(409).json({ message: "Aguarde a confirmação do pagamento antes de avançar o pedido." }); return;
  }
  if (!ORDER_TRANSITIONS[current]?.includes(status)) {
    response.status(409).json({
      message: `Não é possível alterar de ${current} para ${status}.`,
    });
    return;
  }
  if (status === "CANCELED" && !reason) {
    response.status(400).json({ message: "Informe o motivo do cancelamento." });
    return;
  }
  const transitionError = await sequelize.transaction(async (transaction) => {
    if (order.getDataValue("diningSessionId")) {
      const session = await DiningSession.findByPk(order.getDataValue("diningSessionId"), { transaction });
      if (session) {
        await DiningTable.findByPk(session.getDataValue("tableId"), { transaction, lock: transaction.LOCK.UPDATE });
        await session.reload({ transaction, lock: transaction.LOCK.UPDATE });
        if (status === "CANCELED" && session.getDataValue("closedAt")) return "Esta comanda já foi recebida e fechada. O pedido não pode ser cancelado pela central.";
      }
    }
    await order.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (!ORDER_TRANSITIONS[String(order.getDataValue("status")) as OrderStatus]?.includes(status)) return "O pedido foi atualizado por outra pessoa. Atualize a central.";
    const counterPayment = isCounterPayment(order.getDataValue("paymentMethod"), order.getDataValue("paymentProvider"));
    if (status !== "CANCELED" && !counterPayment && !["NOT_REQUIRED", "APPROVED"].includes(String(order.getDataValue("paymentStatus")))) return "Aguarde a confirmação do pagamento antes de avançar o pedido.";
    if (counterPayment && order.getDataValue("paymentStatus") !== "APPROVED") await order.update({ paymentStatus: "NOT_REQUIRED", paymentExpiresAt: null }, { transaction });
    await order.update(
      {
        status,
        cancellationReason: status === "CANCELED" ? reason : null,
        completedAt: status === "COMPLETED" ? new Date() : null,
      },
      { transaction },
    );
    await OrderStatusHistory.create(
      { orderId: order.getDataValue("id"), status },
      { transaction },
    );
    if (status === "CANCELED")
      await revertOrderInventory(String(order.getDataValue("id")), transaction);
    else if (
      ["APPROVED", "NOT_REQUIRED"].includes(
        String(order.getDataValue("paymentStatus")),
      )
    )
      await applyOrderInventory(String(order.getDataValue("id")), transaction);
    return null;
  });
  if (transitionError) { response.status(409).json({ message: transitionError }); return; }
  const updated = await Order.findByPk(request.params.id, {
    include: [
      {
        model: OrderItem,
        as: "items",
        include: [{ model: OrderItemOption, as: "selectedOptions" }],
      },
      { model: OrderStatusHistory, as: "statusHistory" },
    ],
  });
  const event = {
    id: updated?.getDataValue("id"),
    status: updated?.getDataValue("status"),
    updatedAt: updated?.getDataValue("updatedAt"),
  };
  const io = request.app.get("io") as Server | undefined;
  io?.to(ADMIN_ROOM).emit("order:updated", event);
  io?.to(`order:${request.params.id}`).emit("order:status", event);
  response.json(updated);
});

adminRouter.get("/store", async (_request, response) => {
  const [settings] = await StoreSetting.findOrCreate({
    where: {},
    defaults: {
      storeName: "Pizzaria Jeitinho Brasileiro",
      isOpen: true,
      averagePreparationMinutes: 30,
    },
  });
  const plain = settings.get({ plain: true });
  response.json({
    ...plain,
    configuredOpen: plain.isOpen,
    isOpen: await effectiveStoreStatus(settings),
  });
});
adminRouter.patch("/store/status", async (request, response) => {
  if (typeof request.body.isOpen !== "boolean") {
    response.status(400).json({ message: "Status inválido." });
    return;
  }
  const [settings] = await StoreSetting.findOrCreate({
    where: {},
    defaults: { storeName: "Pizzaria Jeitinho Brasileiro" },
  });
  await settings.update({ isOpen: request.body.isOpen });
  const plain = settings.get({ plain: true });
  response.json({
    ...plain,
    configuredOpen: plain.isOpen,
    isOpen: await effectiveStoreStatus(settings),
  });
});
