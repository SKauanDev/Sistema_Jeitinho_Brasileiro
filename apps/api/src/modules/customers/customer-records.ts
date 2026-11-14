import { Op, fn, col, where, literal, type Transaction } from "sequelize";
import { CustomerRecord } from "../../database/models.js";
export function normalizeCustomerPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return [12, 13].includes(digits.length) && digits.startsWith("55")
    ? digits.slice(2)
    : digits;
}
export function customerPhoneSql(
  column: "customer_phone" | "phone" | "original_phone",
) {
  const digits = `REGEXP_REPLACE(COALESCE(${column}, ''), '[^0-9]', '')`;
  return `CASE WHEN CHAR_LENGTH(${digits}) IN (12,13) AND LEFT(${digits},2)='55' THEN SUBSTRING(${digits},3) ELSE ${digits} END`;
}
export function customerPhoneWhere(
  column: "customer_phone" | "phone" | "original_phone",
  phones: string[],
) {
  return where(literal(customerPhoneSql(column)), { [Op.in]: phones });
}
export async function recordForPhone(value: string, transaction?: Transaction) {
  const phone = normalizeCustomerPhone(value),
    variants = [phone, `55${phone}`];
  return CustomerRecord.findOne({
    where: {
      [Op.or]: [
        customerPhoneWhere("original_phone", [phone]),
        customerPhoneWhere("phone", [phone]),
        ...variants.map((alias) =>
          where(fn("JSON_CONTAINS", col("aliases"), JSON.stringify(alias)), 1),
        ),
      ],
    },
    transaction,
  });
}
export function customerAliases(record: any, phone: string): string[] {
  return [
    ...new Set(
      [
        phone,
        record?.getDataValue("originalPhone"),
        ...(Array.isArray(record?.getDataValue("aliases"))
          ? record.getDataValue("aliases")
          : []),
        record?.getDataValue("phone"),
      ]
        .map(normalizeCustomerPhone)
        .filter(Boolean),
    ),
  ];
}
