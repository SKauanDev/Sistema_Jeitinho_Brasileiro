import { randomBytes } from "node:crypto";
import { Router } from "express";
import { Op, type Model, type Transaction } from "sequelize";
import { DiningTable, DiningSession, Order, OrderItem, OrderItemOption } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { requireAuth, requireAdmin } from "../../shared/auth.middleware.js";
import { createRateLimit } from "../../shared/http-security.js";
import { getStoreSetting, effectiveStoreStatus } from "../settings/store-operation.service.js";
import { ADMIN_ROOM } from "../../realtime/socket-security.js";
import { DINING_DENIED, issueDiningAccess, matchesDiningSession, readDiningAccess, scannerOriginAllowed } from "./dining-access.js";

export const adminDiningRouter = Router();
adminDiningRouter.use(requireAuth, requireAdmin);
const includeItems = [{ model: OrderItem, as: "items", include: [{ model: OrderItemOption, as: "selectedOptions" }] }];

export async function lockedTable(key: unknown, sessionId: unknown, transaction: Transaction, tableCount?: number) {
  if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key) || typeof sessionId !== "string") throw new Error("Comanda inválida.");
  const table = await DiningTable.findOne({ where: { accessKey: key }, transaction, lock: transaction.LOCK.UPDATE });
  const count = tableCount ?? Number((await getStoreSetting()).getDataValue("tableCount"));
  if (!table || Number(table.getDataValue("number")) > count || table.getDataValue("sessionId") !== sessionId) throw new Error("Esta comanda foi encerrada. Escaneie novamente o QR da mesa.");
  return table;
}
async function publicTable(key: string, count?: number) {
  const table = /^[a-f0-9]{64}$/.test(key) ? await DiningTable.findOne({ where: { accessKey: key } }) : null;
  if (!table || Number(table.getDataValue("number")) > (count ?? Number((await getStoreSetting()).getDataValue("tableCount")))) return null;
  return table;
}
async function summary(table: Model, existingOrders?: Model[]) {
  const sessionId = table.getDataValue("sessionId");
  const orders = existingOrders ?? (sessionId ? await Order.findAll({ where: { diningSessionId: sessionId }, include: includeItems, order: [["createdAt", "ASC"]] }) : []);
  return { number: table.getDataValue("number"), sessionId, total: Math.round(orders.filter(order => order.getDataValue("status") !== "CANCELED").reduce((sum, order) => sum + Number(order.getDataValue("total")), 0) * 100) / 100,
    orders: orders.map(order => ({ id: order.getDataValue("id"), displayNumber: order.getDataValue("displayNumber"), status: order.getDataValue("status"), total: order.getDataValue("total"), notes: order.getDataValue("notes"), items: (order as any).items, createdAt: order.getDataValue("createdAt") })) };
}
export function createDiningRouter(isOpen = effectiveStoreStatus, tableCount?: number) {
const diningRouter = Router();
diningRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
diningRouter.post("/scan", createRateLimit(300, 10 * 60_000), async (req, res) => {
  if (!scannerOriginAllowed(req)) { res.status(403).json({ message: DINING_DENIED }); return; }
  const table = typeof req.body?.key === "string" ? await publicTable(req.body.key, tableCount) : null;
  if (!table) { res.status(404).json({ message: "Mesa indisponível. Consulte a equipe." }); return; }
  res.json({ accessToken: issueDiningAccess(req.body.key, table.getDataValue("sessionId") ?? null) });
});
diningRouter.use("/:key", (req, res, next) => {
  const access = readDiningAccess(req, req.params.key);
  if (!access) { res.status(403).json({ message: DINING_DENIED }); return; }
  res.locals.diningAccess = access;
  next();
});
diningRouter.get("/:key", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const table = await publicTable(String(req.params.key), tableCount);
  if (!table) { res.status(404).json({ message: "Mesa indisponível. Consulte a equipe." }); return; }
  if (!matchesDiningSession(res.locals.diningAccess, table.getDataValue("sessionId"))) { res.status(403).json({ message: DINING_DENIED }); return; }
  res.json({ ...await summary(table), ...(res.locals.diningAccess.sessionId === null && table.getDataValue("sessionId") ? { accessToken: issueDiningAccess(String(req.params.key), table.getDataValue("sessionId")) } : {}) });
});
diningRouter.post("/:key/open", createRateLimit(300, 10 * 60_000), async (req, res) => {
  const setting = await getStoreSetting();
  if (!await isOpen(setting)) { res.status(409).json({ message: "A loja está fechada no momento." }); return; }
  const found = await publicTable(String(req.params.key), tableCount);
  if (!found) { res.status(404).json({ message: "Mesa indisponível." }); return; }
  if (!matchesDiningSession(res.locals.diningAccess, found.getDataValue("sessionId"))) { res.status(403).json({ message: DINING_DENIED }); return; }
  const table = await sequelize.transaction(async transaction => {
    const table = (await DiningTable.findByPk(found.getDataValue("id"), { transaction, lock: transaction.LOCK.UPDATE }))!;
    if (!table || !matchesDiningSession(res.locals.diningAccess, table.getDataValue("sessionId"))) return null;
    if (Number(table.getDataValue("number")) > (tableCount ?? Number((await getStoreSetting()).getDataValue("tableCount")))) return null;
    if (!table.getDataValue("sessionId")) {
      const session = await DiningSession.create({ tableId: table.getDataValue("id") }, { transaction });
      await table.update({ sessionId: session.getDataValue("id") }, { transaction });
    }
    return table;
  });
  if (!table) { res.status(409).json({ message: "Esta mesa foi desativada. Consulte a equipe." }); return; }
  res.json({ ...await summary(table), accessToken: issueDiningAccess(String(req.params.key), table.getDataValue("sessionId")) });
});
return diningRouter;
}
export const diningRouter = createDiningRouter();
async function ensureTables(count: number) {
  const existing = await DiningTable.findAll({ attributes: ["number"] });
  const numbers = new Set(existing.map(table => Number(table.getDataValue("number"))));
  const missing = Array.from({ length: count }, (_, index) => index + 1).filter(number => !numbers.has(number));
  if (missing.length) await DiningTable.bulkCreate(missing.map(number => ({ number, accessKey: randomBytes(32).toString("hex") })), { ignoreDuplicates: true });
}
adminDiningRouter.get("/", async (_req, res) => {
  const count = Number((await getStoreSetting()).getDataValue("tableCount"));
  await ensureTables(count);
  const tables = await DiningTable.findAll({ where: { number: { [Op.lte]: count } }, order: [["number", "ASC"]] });
  const sessions = tables.map(table => table.getDataValue("sessionId")).filter(Boolean);
  const orders = sessions.length ? await Order.findAll({ where: { diningSessionId: { [Op.in]: sessions } }, include: includeItems, order: [["createdAt", "ASC"]] }) : [];
  const bySession = new Map<string, Model[]>();
  for (const order of orders) {
    const id = String(order.getDataValue("diningSessionId"));
    bySession.set(id, [...(bySession.get(id) ?? []), order]);
  }
  res.json({ count, tables: await Promise.all(tables.map(async table => ({ id: table.getDataValue("id"), key: table.getDataValue("accessKey"), ...await summary(table, bySession.get(String(table.getDataValue("sessionId"))) ?? []) }))) });
});
adminDiningRouter.post("/:id/access", async (req, res) => {
  const table = await DiningTable.findByPk(String(req.params.id));
  if (!table || Number(table.getDataValue("number")) > Number((await getStoreSetting()).getDataValue("tableCount"))) { res.status(404).json({ message: "Mesa indisponível." }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json({ accessToken: issueDiningAccess(table.getDataValue("accessKey"), table.getDataValue("sessionId") ?? null) });
});
adminDiningRouter.put("/count", async (req, res) => {
  const count = req.body.count;
  if (!Number.isInteger(count) || count < 1 || count > 300) { res.status(400).json({ message: "Informe de 1 a 300 mesas." }); return; }
  const result = await sequelize.transaction(async transaction => {
    const hidden = await DiningTable.findAll({ where: { number: { [Op.gt]: count } }, transaction, lock: transaction.LOCK.UPDATE });
    if (hidden.some(table => table.getDataValue("sessionId"))) return false;
    await (await getStoreSetting()).update({ tableCount: count }, { transaction });
    return true;
  });
  if (!result) { res.status(409).json({ message: "Feche as comandas das mesas que serão ocultadas antes de reduzir a quantidade." }); return; }
  await ensureTables(count);
  res.json({ count });
});
adminDiningRouter.post("/:id/close", async (req, res) => {
  if (!["CASH", "PIX", "ONLINE", "RECEIVED_ONLINE"].includes(req.body.paymentMethod)) { res.status(400).json({ message: "Informe como a conta foi recebida." }); return; }
  if (typeof req.body.expectedTotal !== "number" || !Number.isFinite(req.body.expectedTotal) || req.body.expectedTotal < 0) { res.status(400).json({ message: "Atualize a comanda antes de fechar a conta." }); return; }
  const result = await sequelize.transaction(async transaction => {
    const table = await DiningTable.findByPk(String(req.params.id), { transaction, lock: transaction.LOCK.UPDATE });
    if (!table || !table.getDataValue("sessionId")) return null;
    // A stale checkout must never close the next customers' session.
    if (table.getDataValue("sessionId") !== req.body.sessionId) return false;
    const orders = await Order.findAll({ where: { diningSessionId: table.getDataValue("sessionId"), status: { [Op.ne]: "CANCELED" } }, transaction });
    const total = orders.reduce((sum, order) => sum + Number(order.getDataValue("total")), 0);
    if (Math.round(total * 100) !== Math.round(req.body.expectedTotal * 100)) return false;
    await DiningSession.update({ total, closedAt: new Date(), paymentMethod: req.body.paymentMethod, notes: String(req.body.notes ?? "").slice(0, 500) }, { where: { id: table.getDataValue("sessionId") }, transaction });
    await Order.update({ paymentStatus: "APPROVED", paidAt: new Date(), paymentMethod: req.body.paymentMethod }, { where: { diningSessionId: table.getDataValue("sessionId"), status: { [Op.ne]: "CANCELED" } }, transaction });
    await table.update({ sessionId: null }, { transaction });
    return { total, number: table.getDataValue("number") };
  });
  if (!result) { res.status(409).json({ message: "A comanda ou o consumo mudou. Atualize as mesas e confira o valor antes de fechar." }); return; }
  req.app.get("io")?.to(ADMIN_ROOM).emit("order:updated", { table: result.number });
  res.json(result);
});
