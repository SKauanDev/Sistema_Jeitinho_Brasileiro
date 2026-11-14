import { customerProfile, phonesFor, listCustomers } from "./customer-history.service.js";
import { compare, hash } from "bcryptjs";
import { parseCustomerAddress } from "./customer-address.js";
import { Op } from "sequelize";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { Coupon, CustomerRecord, CustomerAccount, CustomerCoupon, Order, OrderItem, OrderItemOption, OrderStatusHistory } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { requireAdmin, requireAuth } from "../../shared/auth.middleware.js";
import { customerAliases, recordForPhone, normalizeCustomerPhone, customerPhoneWhere } from "./customer-records.js";
import { couponWasUsedByPhone } from "../promotions/coupon.service.js";
import { allowEmailAttempt, consumeEmailCode, normalizeEmail, sendEmailCode } from "./email-verification.service.js";

export const publicCustomerRouter = Router();
export const customerRouter = Router();
customerRouter.use(requireAuth, requireAdmin);
const cleanPhone = normalizeCustomerPhone;
const validPassword = (value: unknown) => typeof value === "string" && value.length >= 6 && value.length <= 72;

function customerToken(account: any) { return jwt.sign({ sub: String(account.getDataValue("id")), phone: String(account.getDataValue("phone")), role: "CUSTOMER" }, env.jwtSecret, { expiresIn: "30d" }); }
async function authenticatedProfile(account: any) {
  const phone = String(account.getDataValue("phone")); const profile = await customerProfile(phone, String(account.getDataValue("id")));
  const redemption = await CustomerCoupon.findOne({ where: { customerAccountId: account.getDataValue("id") }, order: [["redeemedAt", "DESC"]] });
  const claimedCode = redemption?.getDataValue("couponCode") ? String(redemption.getDataValue("couponCode")) : "";
  const alreadyUsed = claimedCode ? await couponWasUsedByPhone(claimedCode, phone) : false;
  const usedCouponCodes = [...new Set((profile?.orders ?? []).map((order: any) => String(order.couponCode ?? "").toUpperCase()).filter(Boolean))];
  return { token: customerToken(account), customer: { ...profile, email: account.getDataValue("email"), emailVerified: Boolean(account.getDataValue("emailVerifiedAt")), claimedCouponCode: alreadyUsed ? null : claimedCode || null, usedCouponCodes } };
}

publicCustomerRouter.use(async (request, response, next) => {
  const phone = cleanPhone(request.body?.phone);
  const record = phone ? await recordForPhone(phone) : null;
  if (record && cleanPhone(record.getDataValue("phone")) !== phone && !record.getDataValue("deletedAt")) { response.status(409).json({ message: "O telefone deste cadastro foi atualizado. Consulte a loja." }); return; }
  if (record?.getDataValue("deletedAt")) { response.status(403).json({ message: "Cadastro exclu\u00eddo. Entre em contato com a loja." }); return; }
  next();
});
publicCustomerRouter.post("/register", async (request, response) => {
  const phone = cleanPhone(request.body.phone); const password = request.body.password;
  if (phone.length < 10 || !validPassword(password)) { response.status(400).json({ message: "Informe um telefone válido e uma senha com pelo menos 6 caracteres." }); return; }
  if (!(await phonesFor(phone)).length) { response.status(404).json({ message: "Telefone não encontrado. Faça seu primeiro pedido antes de criar a conta." }); return; }
  if (await CustomerAccount.findOne({ where: customerPhoneWhere("phone",[phone]) })) { response.status(409).json({ message: "Este telefone já possui senha. Entre normalmente ou use 'Esqueci minha senha'." }); return; }
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
  const account = await CustomerAccount.findOne({ where: { [Op.and]: [customerPhoneWhere("phone",[phone]),{active:true}] } });
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
      const account = await CustomerAccount.findOne({ where: { [Op.and]: [customerPhoneWhere("phone",[phone]),{email,active:true}] }, transaction, lock: transaction.LOCK.UPDATE });
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
      const found = await CustomerAccount.findOne({ where: customerPhoneWhere("phone",[phone]), transaction, lock: transaction.LOCK.UPDATE });
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

customerRouter.get("/", async (_request,response) => { response.json(await listCustomers()); });
customerRouter.get("/:phone", async (request, response) => { const profile = await customerProfile(cleanPhone(request.params.phone)); if (!profile) { response.status(404).json({ message: "Cliente não encontrado." }); return; } response.json(profile); });

customerRouter.patch("/:phone", async (request, response) => {
  const originalPhone = cleanPhone(request.params.phone), phone = cleanPhone(request.body.phone);
  const name = String(request.body.name ?? "").trim(), email = String(request.body.email ?? "").trim().toLowerCase();
  if (!name || name.length > 120 || phone.length < 10 || String(request.body.phone ?? "").replace(/\D/g, "").length > 13 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || email.length > 254) { response.status(400).json({ message: "Informe nome, telefone e e-mail v\u00e1lidos." }); return; }
  let address: Record<string,string> | undefined;
  if (request.body.address !== undefined) { try { address = parseCustomerAddress(request.body.address); } catch(error) { response.status(400).json({message:(error as Error).message}); return; } }
  if (!await customerProfile(originalPhone)) { response.status(404).json({ message: "Cliente n\u00e3o encontrado." }); return; }
  try {
    await sequelize.transaction(async transaction => {
      const records = await CustomerRecord.findAll({ transaction, lock: transaction.LOCK.UPDATE });
      const record = records.find(record => customerAliases(record, String(record.getDataValue("originalPhone"))).includes(originalPhone));
      if (record?.getDataValue("deletedAt")) throw Error("Cliente exclu\u00eddo.");
      const aliases = customerAliases(record, originalPhone);
      if (records.some(other => other !== record && customerAliases(other, String(other.getDataValue("originalPhone"))).includes(phone))) throw Error("Este telefone pertence a outro cadastro.");
      const collision = !aliases.includes(phone) && (await phonesFor(phone)).length > 0;
      if (collision) throw Error("Este telefone j\u00e1 possui hist\u00f3rico de outro cliente.");
      const accounts = await CustomerAccount.findAll({ where: customerPhoneWhere("phone",aliases), transaction, lock: transaction.LOCK.UPDATE });
      const account = accounts[0];
      if (await CustomerAccount.findOne({ where: { [Op.and]: [customerPhoneWhere("phone",[phone]), ...(account ? [{id:{[Op.ne]:account.getDataValue("id")}}] : [])] }, transaction })) throw Error("Telefone vinculado a outra conta.");
      if (account) await account.update({ phone, email: email || null, ...(account.getDataValue("email") !== (email || null) ? { emailVerifiedAt: null, pendingEmail: null, emailCodeHash: null, emailCodeExpiresAt: null, emailCodePurpose: null } : {}) }, { transaction });
      const values = { phone, name, email: email || null, ...(address !== undefined ? { address } : {}), aliases: [...new Set([...aliases, phone])] };
      if (record) await record.update(values, { transaction }); else await CustomerRecord.create({ originalPhone, ...values }, { transaction });
    });
    response.json(await customerProfile(originalPhone));
  } catch (error) { response.status(409).json({ message: (error as Error).message }); }
});
customerRouter.delete("/:phone", async (request, response) => {
  const phone = cleanPhone(request.params.phone);
  const profile = await customerProfile(phone);
  if (!profile) { response.status(404).json({ message: "Cliente n\u00e3o encontrado." }); return; }
  await sequelize.transaction(async transaction => {
    const record = await recordForPhone(phone, transaction);
    if (record) await record.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const aliases = customerAliases(record, phone);
    const accounts = await CustomerAccount.findAll({ where: customerPhoneWhere("phone",aliases), transaction, lock: transaction.LOCK.UPDATE });
    for (const account of accounts) {
      await CustomerCoupon.destroy({ where: { customerAccountId: account.getDataValue("id") }, transaction });
      await Order.update({ customerAccountId: null }, { where: { customerAccountId: account.getDataValue("id") }, transaction });
      await account.destroy({ transaction });
    }
    if (record) await record.update({ deletedAt: new Date() }, { transaction });
    else await CustomerRecord.create({ originalPhone: phone, phone, aliases, name: profile.name, deletedAt: new Date() }, { transaction });
  });
  response.status(204).end();
});
