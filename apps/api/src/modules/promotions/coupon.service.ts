import { QueryTypes, type Transaction } from "sequelize";
import { Coupon } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";

const phoneSql = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(customer_phone, '(', ''), ')', ''), '-', ''), ' ', ''), '+', '')";

export async function couponWasUsedByPhone(code: string, phone: string, transaction?: Transaction) {
  const normalizedPhone = phone.replace(/\D/g, ""); if (!normalizedPhone) return false;
  const rows = await sequelize.query<{ total: number }>(`SELECT COUNT(*) AS total FROM orders WHERE coupon_code = :code AND ${phoneSql} = :phone`, { replacements: { code: code.trim().toUpperCase(), phone: normalizedPhone }, type: QueryTypes.SELECT, transaction });
  return Number(rows[0]?.total ?? 0) > 0;
}

export async function calculateCoupon(code: string, subtotal: number, transaction?: Transaction, lock = false, customerPhone = "") {
  const normalized = code.trim().toUpperCase();
  const coupon = await Coupon.findOne({ where: { code: normalized }, transaction, ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!coupon || !coupon.getDataValue("active")) throw new Error("Cupom inválido ou inativo.");
  if (customerPhone && await couponWasUsedByPhone(normalized, customerPhone, transaction)) throw new Error("Cupom expirado para este cliente.");
  const now = new Date(); if (now < new Date(coupon.getDataValue("startsAt")) || now > new Date(coupon.getDataValue("expiresAt"))) throw new Error("Este cupom está fora do período de validade.");
  const limit = coupon.getDataValue("usageLimit"); if (limit !== null && Number(coupon.getDataValue("usageCount")) >= Number(limit)) throw new Error("Este cupom atingiu o limite de utilizações.");
  const minimum = Number(coupon.getDataValue("minimumOrder")); if (subtotal < minimum) throw new Error(`Pedido mínimo de R$ ${minimum.toFixed(2).replace(".", ",")} para este cupom.`);
  let discount = coupon.getDataValue("discountType") === "PERCENTAGE" ? subtotal * Number(coupon.getDataValue("discountValue")) / 100 : Number(coupon.getDataValue("discountValue"));
  const maximum = coupon.getDataValue("maximumDiscount"); if (maximum !== null) discount = Math.min(discount, Number(maximum)); discount = Number(Math.min(discount, subtotal).toFixed(2));
  return { coupon, code: normalized, discount, totalAfterDiscount: Number((subtotal - discount).toFixed(2)) };
}
