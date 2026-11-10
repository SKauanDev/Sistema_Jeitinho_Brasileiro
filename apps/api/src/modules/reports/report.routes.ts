import { Op } from "sequelize";
import { Router } from "express";
import { Category, Order, OrderItem, Product } from "../../database/models.js";
import { requireAdmin, requireAuth } from "../../shared/auth.middleware.js";
export const reportRouter = Router();
reportRouter.use(requireAuth, requireAdmin);
const number = (value: unknown) => Number(value ?? 0);
function range(period: string, startValue?: string, endValue?: string) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  if (period === "custom" && startValue && endValue) {
    start = new Date(`${startValue}T00:00:00`);
    end.setTime(new Date(`${endValue}T23:59:59.999`).getTime());
  } else if (period === "7d") start.setDate(start.getDate() - 7);
  else if (period === "30d") start.setDate(start.getDate() - 30);
  else if (period === "month")
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (period === "previous_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end.setTime(
      new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime(),
    );
  } else if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else start.setHours(0, 0, 0, 0);
  return { start, end };
}
reportRouter.get("/filters", async (_request, response) => {
  const [categories, products] = await Promise.all([
    Category.findAll({ attributes: ["id", "name"], order: [["name", "ASC"]] }),
    Product.findAll({
      attributes: ["id", "name", "categoryId"],
      order: [["name", "ASC"]],
    }),
  ]);
  response.json({
    categories,
    products,
    paymentMethods: [
      { id: "PIX", name: "PIX" },
      { id: "CASH", name: "Dinheiro" },
      { id: "CREDIT_CARD", name: "Cartão de crédito online" },
      { id: "DEBIT_CARD", name: "Cartão de débito online" },
      { id: "ONLINE", name: "Cartão na entrega" },
      { id: "NOT_INFORMED", name: "Não informado" },
    ],
  });
});
reportRouter.get("/", async (request, response) => {
  const { start, end } = range(
    String(request.query.period ?? "month"),
    String(request.query.start ?? ""),
    String(request.query.end ?? ""),
  );
  const categoryId = String(request.query.categoryId ?? "");
  const productId = String(request.query.productId ?? "");
  const paymentMethod = String(request.query.paymentMethod ?? "");
  const orders = await Order.findAll({
    where: { createdAt: { [Op.between]: [start, end] } },
    include: [
      {
        model: OrderItem,
        as: "items",
        include: [
          {
            model: Product,
            as: "product",
            include: [{ model: Category, as: "category" }],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });
  let plain = orders.map(
    (item) => item.get({ plain: true }) as Record<string, any>,
  );
  if (paymentMethod)
    plain = plain.filter((order) =>
      paymentMethod === "NOT_INFORMED"
        ? !order.paymentMethod
        : order.paymentMethod === paymentMethod,
    );
  if (productId)
    plain = plain.filter((order) =>
      order.items.some((item: any) => item.productId === productId),
    );
  if (categoryId)
    plain = plain.filter((order) =>
      order.items.some((item: any) => item.product?.categoryId === categoryId),
    );
  const completed = plain.filter((order) => order.status === "COMPLETED");
  const revenue = completed.reduce(
    (sum, order) => sum + number(order.total),
    0,
  );
  const productMap = new Map<
    string,
    { id: string; name: string; quantity: number; revenue: number }
  >();
  completed
    .flatMap((order) => order.items)
    .forEach((item: any) => {
      const key = item.productId ?? item.productName;
      const row = productMap.get(key) ?? {
        id: key,
        name: item.productName,
        quantity: 0,
        revenue: 0,
      };
      row.quantity += number(item.quantity);
      row.revenue += number(item.lineTotal);
      productMap.set(key, row);
    });
  const products = [...productMap.values()];
  const customerMap = new Map<
    string,
    { name: string; phone: string; orders: number; totalSpent: number }
  >();
  completed.forEach((order) => {
    const key = String(order.customerPhone).replace(/\D/g, "");
    const row = customerMap.get(key) ?? {
      name: order.customerName,
      phone: order.customerPhone,
      orders: 0,
      totalSpent: 0,
    };
    row.orders += 1;
    row.totalSpent += number(order.total);
    customerMap.set(key, row);
  });
  const cancellations = plain.filter((order) => order.status === "CANCELED");
  const reasonMap = new Map<
    string,
    { reason: string; count: number; lostValue: number }
  >();
  cancellations.forEach((order) => {
    const reason = order.cancellationReason || "Motivo não informado";
    const row = reasonMap.get(reason) ?? { reason, count: 0, lostValue: 0 };
    row.count += 1;
    row.lostValue += number(order.total);
    reasonMap.set(reason, row);
  });
  response.json({
    period: { start, end },
    sales: {
      revenue,
      orders: completed.length,
      averageTicket: completed.length ? revenue / completed.length : 0,
      delivery: completed.filter(
        (order) => order.fulfillmentType === "DELIVERY",
      ).length,
      pickup: completed.filter((order) => order.fulfillmentType === "PICKUP")
        .length,
    },
    topProducts: [...products]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
    bottomProducts: [...products]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 10),
    topCustomers: [...customerMap.values()]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10),
    cancellations: {
      count: cancellations.length,
      lostValue: cancellations.reduce(
        (sum, order) => sum + number(order.total),
        0,
      ),
      reasons: [...reasonMap.values()],
    },
    orders: plain.map((order) => ({
      id: order.id,
      displayNumber: order.displayNumber,
      createdAt: order.createdAt,
      customerName: order.customerName,
      fulfillmentType: order.fulfillmentType,
      paymentMethod: order.paymentMethod,
      total: number(order.total),
      status: order.status,
    })),
  });
});
