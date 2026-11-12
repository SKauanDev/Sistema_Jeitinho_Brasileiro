import { Op } from "sequelize";
import { Router } from "express";
import { FinancialEntry, Order } from "../../database/models.js";
import { requireAdmin, requireAuth } from "../../shared/auth.middleware.js";

export const financeRouter = Router();
financeRouter.use(requireAuth, requireAdmin);
function range(period: string, customStart?: string, customEnd?: string) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);
  if (period === "custom" && customStart && customEnd) {
    start = new Date(`${customStart}T00:00:00`);
    end.setTime(new Date(`${customEnd}T23:59:59.999`).getTime());
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
const number = (value: unknown) => Number(value ?? 0);
const paymentNames: Record<string, string> = {
  PIX: "PIX",
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito online",
  DEBIT_CARD: "Cartão de débito online",
  ONLINE: "Cartão na entrega",
  RECEIVED_ONLINE: "Pagamento online recebido",
};

financeRouter.get("/", async (request, response) => {
  const { start, end } = range(
    String(request.query.period ?? "today"),
    String(request.query.start ?? ""),
    String(request.query.end ?? ""),
  );
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const [orders, entries] = await Promise.all([
    Order.findAll({
      where: { createdAt: { [Op.between]: [start, end] } },
      order: [["createdAt", "DESC"]],
    }),
    FinancialEntry.findAll({
      where: { entryDate: { [Op.between]: [startDate, endDate] } },
      order: [
        ["entryDate", "DESC"],
        ["createdAt", "DESC"],
      ],
    }),
  ]);
  const plainOrders = orders.map(
    (item) => item.get({ plain: true }) as Record<string, unknown>,
  );
  const completed = plainOrders.filter((item) => item.status === "COMPLETED");
  const revenue = completed.reduce((sum, item) => sum + number(item.total), 0);
  const deliveryFees = completed.reduce(
    (sum, item) => sum + number(item.deliveryFee),
    0,
  );
  const plainEntries = entries.map(
    (item) => item.get({ plain: true }) as Record<string, unknown>,
  );
  const manualEntries = plainEntries.filter((item) => !item.sourceId);
  const manualIn = manualEntries
    .filter((item) => item.type === "IN")
    .reduce((sum, item) => sum + number(item.amount), 0);
  const expenses = plainEntries
    .filter((item) => item.type === "OUT")
    .reduce((sum, item) => sum + number(item.amount), 0);
  const days = new Map<
    string,
    { date: string; revenue: number; orders: number; expenses: number }
  >();
  completed.forEach((item) => {
    const date = new Date(String(item.createdAt)).toISOString().slice(0, 10);
    const day = days.get(date) ?? { date, revenue: 0, orders: 0, expenses: 0 };
    day.revenue += number(item.total);
    day.orders += 1;
    days.set(date, day);
  });
  manualEntries.forEach((item) => {
    const date = String(item.entryDate);
    const day = days.get(date) ?? { date, revenue: 0, orders: 0, expenses: 0 };
    if (item.type === "IN") day.revenue += number(item.amount);
    else day.expenses += number(item.amount);
    days.set(date, day);
  });
  const paymentTotals = new Map<string, number>();
  completed.forEach((item) => {
    const method = String(item.paymentMethod ?? "NOT_INFORMED");
    paymentTotals.set(
      method,
      (paymentTotals.get(method) ?? 0) + number(item.total),
    );
  });
  response.json({
    period: { start, end },
    kpis: {
      revenue,
      paidOrders: completed.length,
      averageTicket: completed.length ? revenue / completed.length : 0,
      discounts: 0,
      deliveryFees,
      cancellations: plainOrders.filter((item) => item.status === "CANCELED")
        .length,
    },
    cashFlow: {
      sales: revenue,
      manualIncome: manualIn,
      income: revenue + manualIn,
      expenses,
      balance: revenue + manualIn - expenses,
    },
    chart: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    payments: [...paymentTotals].map(([method, value]) => ({
      method,
      name: paymentNames[method] ?? "Não informado",
      value,
      percentage: revenue ? Number(((value / revenue) * 100).toFixed(1)) : 0,
    })),
    entries,
    recentOrders: orders.slice(0, 20),
  });
});
financeRouter.post("/entries", async (request, response) => {
  const type = String(request.body.type);
  const amount = number(request.body.amount);
  const category = String(request.body.category ?? "").trim();
  const description = String(request.body.description ?? "").trim();
  const entryDate = String(request.body.entryDate ?? "");
  if (
    !["IN", "OUT"].includes(type) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !category ||
    !description ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)
  ) {
    response
      .status(400)
      .json({ message: "Preencha os dados do lançamento corretamente." });
    return;
  }
  const entry = await FinancialEntry.create({
    type,
    amount,
    category,
    description,
    entryDate,
    notes: request.body.notes,
    createdBy: (response.locals.user as { username?: string }).username,
  });
  response.status(201).json(entry);
});
