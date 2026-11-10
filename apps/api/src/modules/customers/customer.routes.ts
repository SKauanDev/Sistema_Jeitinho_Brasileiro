import { compare, hash } from "bcryptjs";
import { QueryTypes } from "sequelize";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { Coupon, CustomerAccount, CustomerCoupon, Order, OrderItem, OrderItemOption, OrderStatusHistory } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { requireAdmin, requireAuth } from "../../shared/auth.middleware.js";
import { couponWasUsedByPhone } from "../promotions/coupon.service.js";
import { expireUnpaidOrders } from "../payments/payment-timeout.service.js";
import { allowEmailAttempt, consumeEmailCode, normalizeEmail, sendEmailCode } from "./email-verification.service.js";

export const publicCustomerRouter = Router();
export const customerRouter = Router();
customerRouter.use(requireAuth, requireAdmin);
const phoneSql = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '')";
const cleanPhone = (value: unknown) => String(value ?? "").replace(/\D/g, "").slice(0, 13);
const validPassword = (value: unknown) => typeof value === "string" && value.length >= 6 && value.length <= 72;

async function phonesFor(phone: string) {
  return sequelize.query<{ customerPhone: string }>(`SELECT DISTINCT customer_phone AS customerPhone FROM orders WHERE ${phoneSql} = :phone`, { replacements: { phone }, type: QueryTypes.SELECT });
}
async function customerProfile(phone: string, customerAccountId?: string) {
  const rows = await phonesFor(phone); if (!rows.length) return null;
  await expireUnpaidOrders(undefined, rows.map(row => row.customerPhone));
  const orders = await Order.findAll({ where: customerAccountId ? { customerAccountId } : { customerPhone: rows.map((row) => row.customerPhone) }, include: [{ model: OrderItem, as: "items", include: [{ model: OrderItemOption, as: "selectedOptions" }] }, { model: OrderStatusHistory, as: "statusHistory" }], order: [["createdAt", "DESC"]] });
  const plain = orders.map((order) => order.get({ plain: true }) as Record<string, unknown>); const completed = plain.filter((order) => order.status === "COMPLETED"); const totalSpent = completed.reduce((sum, order) => sum + Number(order.total), 0);
  return { id: phone, name: plain[0]?.customerName, phone: plain[0]?.customerPhone, customerSince: plain.at(-1)?.createdAt, lastOrderAt: plain[0]?.createdAt, ordersCount: plain.length, completedOrders: completed.length, totalSpent, averageTicket: completed.length ? totalSpent / completed.length : 0, orders };
}
function customerToken(account: any) { return jwt.sign({ sub: String(account.getDataValue("id")), phone: String(account.getDataValue("phone")), role: "CUSTOMER" }, env.jwtSecret, { expiresIn: "30d" }); }
async function authenticatedProfile(account: any) {
  const phone = String(account.getDataValue("phone")); const profile = await customerProfile(phone, String(account.getDataValue("id")));
  const redemption = await CustomerCoupon.findOne({ where: { customerAccountId: account.getDataValue("id") }, order: [["redeemedAt", "DESC"]] });
  const claimedCode = redemption?.getDataValue("couponCode") ? String(redemption.getDataValue("couponCode")) : "";
  const alreadyUsed = claimedCode ? await couponWasUsedByPhone(claimedCode, phone) : false;
  const usedCouponCodes = [...new Set((profile?.orders ?? []).map((order: any) => String(order.couponCode ?? "").toUpperCase()).filter(Boolean))];
  return { token: customerToken(account), customer: { ...profile, email: account.getDataValue("email"), emailVerified: Boolean(account.getDataValue("emailVerifiedAt")), claimedCouponCode: alreadyUsed ? null : claimedCode || null, usedCouponCodes } };
}

publicCustomerRouter.post("/register", async (request, response) => {
  const phone = cleanPhone(request.body.phone); const password = request.body.password;
  if (phone.length < 10 || !validPassword(password)) { response.status(400).json({ message: "Informe um telefone válido e uma senha com pelo menos 6 caracteres." }); return; }
  if (!(await phonesFor(phone)).length) { response.status(404).json({ message: "Telefone não encontrado. Faça seu primeiro pedido antes de criar a conta." }); return; }
  if (await CustomerAccount.findOne({ where: { phone } })) { response.status(409).json({ message: "Este telefone já possui senha. Entre normalmente ou use 'Esqueci minha senha'." }); return; }
  let orderId: string;
  try {
    const claims = jwt.verify(String(request.body.orderToken ?? ""), env.jwtSecret, { algorithms: ["HS256"], audience: "urfood-order-tracking" });
    if (typeof claims === "string" || claims.role !== "ORDER_TRACKING" || claims.orderId !== request.body.orderId) throw new Error();
    orderId = String(claims.orderId);
  } catch { response.status(403).json({ message: "Crie a conta no dispositivo usado para fazer seu primeiro pedido." }); return; }
  try {
    const account = await sequelize.transaction(async transaction => {
      const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!order || cleanPhone(order.getDataValue("customerPhone")) !== phone || order.getDataValue("customerAccountId")) throw new Error("O pedido informado não permite criar esta conta.");
      const created = await CustomerAccount.create({ phone, passwordHash: await hash(password, 12), active: true }, { transaction });
      await order.update({ customerAccountId: created.getDataValue("id") }, { transaction });
      return created;
    });
    response.status(201).json(await authenticatedProfile(account));
  } catch { response.status(409).json({ message: "Não foi possível criar a conta. Confira o pedido ou entre com sua senha." }); }
});
publicCustomerRouter.post("/login", async (request, response) => {
  const phone = cleanPhone(request.body.phone); const password = String(request.body.password ?? "");
  if (!phone || !password) { response.status(400).json({ message: "Informe telefone e senha." }); return; }
  const account = await CustomerAccount.findOne({ where: { phone, active: true } });
  if (!account) { response.status(409).json({ code: "ACCOUNT_SETUP_REQUIRED", message: "Primeiro acesso: crie uma senha para este telefone." }); return; }
  if (!(await compare(password, String(account.getDataValue("passwordHash"))))) { response.status(401).json({ message: "Telefone ou senha inválidos." }); return; }
  response.json(await authenticatedProfile(account));
});
publicCustomerRouter.post("/reset-password/request", async (request, response) => {
  const phone = cleanPhone(request.body.phone);
  try {
    const email = normalizeEmail(request.body.email);
    if (!allowEmailAttempt(`send-ip:${request.ip}`, 15) || !allowEmailAttempt(`send-phone:${phone}`, 5)) {
      response.status(429).json({ message: "Aguarde antes de solicitar outro código." }); return;
    }
    await sequelize.transaction(async (transaction) => {
      const account = await CustomerAccount.findOne({ where: { phone, email, active: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (account?.getDataValue("emailVerifiedAt")) await sendEmailCode(account, email, "RESET", transaction);
    });
    response.json({ message: "Se os dados correspondem a uma conta com e-mail confirmado, você receberá um código.", retryAfter: 60 });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Não foi possível enviar o e-mail." });
  }
});
publicCustomerRouter.post("/reset-password", async (request, response) => {
  const phone = cleanPhone(request.body.phone); const password = request.body.password;
  if (phone.length < 10 || !validPassword(password)) { response.status(400).json({ message: "Informe o telefone e uma nova senha com pelo menos 6 caracteres." }); return; }
  if (!allowEmailAttempt(`check-ip:${request.ip}`, 30) || !allowEmailAttempt(`check-phone:${phone}`, 10)) {
    response.status(429).json({ message: "Limite de tentativas atingido. Tente novamente mais tarde." }); return;
  }
  try {
    if (!(await phonesFor(phone)).length) { response.status(404).json({ message: "Telefone não encontrado. Faça seu primeiro pedido antes de criar a conta." }); return; }
    const passwordHash = await hash(password, 12);
    const account = await sequelize.transaction(async (transaction) => {
      const found = await CustomerAccount.findOne({ where: { phone }, transaction, lock: transaction.LOCK.UPDATE });
      if (!found) return CustomerAccount.create({ phone, passwordHash, active: true }, { transaction });
      await found.update({ passwordHash, active: true, emailCodeHash: null, emailCodePurpose: null, emailCodeExpiresAt: null, pendingEmail: null }, { transaction }); return found;
    });
    response.json(await authenticatedProfile(account));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "Não foi possível redefinir a senha." });
  }
});
publicCustomerRouter.post("/email/request", requireAuth, async (request, response) => {
  try {
    const auth = response.locals.user as { sub?: string; role?: string };
    if (auth.role !== "CUSTOMER") { response.status(403).json({ message: "Entre no perfil do cliente." }); return; }
    const email = normalizeEmail(request.body.email);
    if (!allowEmailAttempt(`verify-ip:${request.ip}`, 15) || !allowEmailAttempt(`verify-account:${auth.sub}`, 5)) { response.status(429).json({ message: "Limite de envios atingido. Tente mais tarde." }); return; }
    await sequelize.transaction(async (transaction) => {
      const account = await CustomerAccount.findByPk(auth.sub, { transaction, lock: transaction.LOCK.UPDATE });
      if (!account?.getDataValue("active") || !await compare(String(request.body.password ?? ""), String(account.getDataValue("passwordHash")))) throw new Error("Confirme sua senha atual para cadastrar o e-mail.");
      await sendEmailCode(account, email, "VERIFY", transaction);
    });
    response.json({ message: "Código enviado. Confira também o spam." });
  } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "Falha ao enviar e-mail." }); }
});
publicCustomerRouter.post("/email/confirm", requireAuth, async (request, response) => {
  try {
    const auth = response.locals.user as { sub?: string; role?: string };
    if (auth.role !== "CUSTOMER") { response.status(403).json({ message: "Entre no perfil do cliente." }); return; }
    if (!allowEmailAttempt(`verify-check:${auth.sub}`, 15)) { response.status(429).json({ message: "Limite de tentativas atingido." }); return; }
    const account = await sequelize.transaction(async (transaction) => {
      const found = await CustomerAccount.findByPk(auth.sub, { transaction, lock: transaction.LOCK.UPDATE });
      if (!found?.getDataValue("active") || !await consumeEmailCode(found, "VERIFY", String(request.body.code ?? ""), transaction)) return null;
      await found.update({ email: found.getDataValue("pendingEmail"), emailVerifiedAt: new Date(), pendingEmail: null }, { transaction }); return found;
    });
    if (!account) throw new Error("Código inválido, expirado ou limite de tentativas atingido.");
    response.json((await authenticatedProfile(account)).customer);
  } catch (error) { response.status(400).json({ message: error instanceof Error ? error.message : "Falha ao confirmar e-mail." }); }
});
publicCustomerRouter.get("/session", requireAuth, async (_request, response) => {
  const auth = response.locals.user as { sub?: string; role?: string }; if (auth.role !== "CUSTOMER") { response.status(403).json({ message: "Sessão de cliente inválida." }); return; }
  const account = await CustomerAccount.findByPk(auth.sub); if (!account || !account.getDataValue("active")) { response.status(401).json({ message: "Conta não encontrada." }); return; }
  response.json((await authenticatedProfile(account)).customer);
});
publicCustomerRouter.post("/coupons/:couponId/redeem", requireAuth, async (request, response) => {
  const auth = response.locals.user as { sub?: string; phone?: string; role?: string }; if (auth.role !== "CUSTOMER") { response.status(403).json({ message: "Entre no perfil para resgatar o cupom." }); return; }
  const coupon = await Coupon.findByPk(String(request.params.couponId)); const now = new Date();
  if (!coupon || !coupon.getDataValue("active") || new Date(String(coupon.getDataValue("startsAt"))) > now || new Date(String(coupon.getDataValue("expiresAt"))) < now) { response.status(404).json({ message: "Cupom indisponível ou expirado." }); return; }
  const sameCoupon = await CustomerCoupon.findOne({ where: { customerAccountId: auth.sub, couponId: coupon.getDataValue("id") } }); if (sameCoupon) { response.status(409).json({ message: "Este cupom já foi utilizado ou resgatado por você." }); return; }
  const pending = await CustomerCoupon.findOne({ where: { customerAccountId: auth.sub }, order: [["redeemedAt", "DESC"]] }); if (pending && !(await couponWasUsedByPhone(String(pending.getDataValue("couponCode")), String(auth.phone ?? "")))) { response.status(409).json({ message: `Você já possui o cupom ${pending.getDataValue("couponCode")} aguardando uso.` }); return; }
  const redemption = await CustomerCoupon.create({ customerAccountId: auth.sub, couponId: coupon.getDataValue("id"), couponCode: coupon.getDataValue("code") }); response.status(201).json({ code: redemption.getDataValue("couponCode") });
});

customerRouter.get("/", async (_request, response) => {
  const customers = await sequelize.query(`SELECT ${phoneSql} AS id, SUBSTRING_INDEX(GROUP_CONCAT(customer_name ORDER BY created_at DESC SEPARATOR '||'), '||', 1) AS name, SUBSTRING_INDEX(GROUP_CONCAT(customer_phone ORDER BY created_at DESC SEPARATOR '||'), '||', 1) AS phone, COUNT(*) AS ordersCount, SUM(CASE WHEN status = 'COMPLETED' THEN total ELSE 0 END) AS totalSpent, SUM(status = 'COMPLETED') AS completedOrders, MAX(created_at) AS lastOrderAt, MIN(created_at) AS customerSince FROM orders GROUP BY ${phoneSql} ORDER BY lastOrderAt DESC`, { type: QueryTypes.SELECT });
  response.json(customers.map((raw) => { const item = raw as Record<string, unknown>; const completed = Number(item.completedOrders ?? 0); const total = Number(item.totalSpent ?? 0); return { ...item, ordersCount: Number(item.ordersCount), completedOrders: completed, totalSpent: total, averageTicket: completed ? total / completed : 0 }; }));
});
customerRouter.get("/:phone", async (request, response) => { const profile = await customerProfile(cleanPhone(request.params.phone)); if (!profile) { response.status(404).json({ message: "Cliente não encontrado." }); return; } response.json(profile); });
