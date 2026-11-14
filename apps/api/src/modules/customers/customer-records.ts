import { Op, fn, col, where, type Transaction } from "sequelize";
import { CustomerRecord } from "../../database/models.js";
export async function recordForPhone(phone: string, transaction?: Transaction) {
  return CustomerRecord.findOne({ where: { [Op.or]: [{ originalPhone: phone }, { phone }, where(fn("JSON_CONTAINS", col("aliases"), JSON.stringify(phone)), 1)] }, transaction });
}
export function customerAliases(record: any, phone: string): string[] {
  return [...new Set([phone, ...(Array.isArray(record?.getDataValue("aliases")) ? record.getDataValue("aliases") : []), record?.getDataValue("phone")].filter(Boolean))] as string[];
}
