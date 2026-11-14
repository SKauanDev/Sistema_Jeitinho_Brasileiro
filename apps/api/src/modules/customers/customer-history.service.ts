import { Op, QueryTypes } from "sequelize";
import {
  CustomerAccount,
  CustomerRecord,
  Order,
  OrderItem,
  OrderItemOption,
  OrderStatusHistory,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import {
  customerAliases,
  customerPhoneSql,
  customerPhoneWhere,
  normalizeCustomerPhone,
  recordForPhone,
} from "./customer-records.js";

const addressKeys = [
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
  "postalCode",
  "complement",
] as const;
type Row = Record<string, any>;
export function resolvedCustomerAddress(saved: unknown, orders: Row[]) {
  const value =
    saved && typeof saved === "object" && !Array.isArray(saved)
      ? (saved as Row)
      : {};
  const deliveries = orders.filter(
    (order) =>
      order.fulfillmentType === "DELIVERY" && String(order.street ?? "").trim(),
  );
  const delivery =
    deliveries.find((order) => order.status !== "CANCELED") ?? deliveries[0];
  const address = Object.fromEntries(
    addressKeys.map((key) => [
      key,
      String(value[key] ?? "").trim() || String(delivery?.[key] ?? "").trim(),
    ]),
  );
  return Object.values(address).some(Boolean) ? address : null;
}
export async function phonesFor(value: string) {
  const phone = normalizeCustomerPhone(value);
  return sequelize.query<{ customerPhone: string }>(
    `SELECT DISTINCT customer_phone AS customerPhone FROM orders WHERE ${customerPhoneSql("customer_phone")}=:phone`,
    { replacements: { phone }, type: QueryTypes.SELECT },
  );
}
export async function customerProfile(
  value: string,
  customerAccountId?: string,
) {
  const phone = normalizeCustomerPhone(value),
    record = await recordForPhone(phone);
  if (record?.getDataValue("deletedAt")) return null;
  const aliases = customerAliases(record, phone);
  const accounts = await CustomerAccount.findAll({
    where: customerAccountId
      ? { id: customerAccountId }
      : customerPhoneWhere("phone", aliases),
    attributes: ["id", "phone", "email", "createdAt"],
  });
  // Staff can see the CRM history. Customer sessions remain restricted to the
  // account ID verified by authentication, without claiming guest orders by phone.
  const orders = await Order.findAll({
    where: customerAccountId
      ? { customerAccountId }
      : {
          [Op.or]: [
            customerPhoneWhere("customer_phone", aliases),
            ...(accounts.length
              ? [
                  {
                    customerAccountId: {
                      [Op.in]: accounts.map((account) =>
                        account.getDataValue("id"),
                      ),
                    },
                  },
                ]
              : []),
          ],
        },
    include: [
      {
        model: OrderItem,
        as: "items",
        include: [{ model: OrderItemOption, as: "selectedOptions" }],
      },
      { model: OrderStatusHistory, as: "statusHistory" },
    ],
    order: [
      ["createdAt", "DESC"],
      ["displayNumber", "DESC"],
    ],
  });
  if (!orders.length && !record && !accounts.length) return null;
  const plain = orders.map((order) => order.get({ plain: true }) as Row),
    completed = plain.filter((order) => order.status === "COMPLETED"),
    totalSpent = completed.reduce((sum, order) => sum + Number(order.total), 0);
  const contact =
    accounts.find(
      (account) =>
        normalizeCustomerPhone(account.getDataValue("phone")) ===
        normalizeCustomerPhone(record?.getDataValue("phone") ?? phone),
    ) ?? accounts[0];
  return {
    id: record?.getDataValue("originalPhone") ?? phone,
    name: record?.getDataValue("name") ?? plain[0]?.customerName ?? "",
    phone: normalizeCustomerPhone(
      record?.getDataValue("phone") ??
        contact?.getDataValue("phone") ??
        plain[0]?.customerPhone ??
        phone,
    ),
    email: contact?.getDataValue("email") ?? record?.getDataValue("email"),
    address: resolvedCustomerAddress(record?.getDataValue("address"), plain),
    customerSince:
      plain.at(-1)?.createdAt ??
      record?.getDataValue("createdAt") ??
      contact?.getDataValue("createdAt"),
    lastOrderAt:
      plain[0]?.createdAt ??
      record?.getDataValue("createdAt") ??
      contact?.getDataValue("createdAt"),
    ordersCount: plain.length,
    completedOrders: completed.length,
    totalSpent,
    averageTicket: completed.length ? totalSpent / completed.length : 0,
    orders,
  };
}
export async function listCustomers() {
  const sql = customerPhoneSql("customer_phone");
  const [rows, records, accounts] = await Promise.all([
    sequelize.query<Row>(
      `SELECT ${sql} AS id, customer_account_id AS accountId, SUBSTRING_INDEX(GROUP_CONCAT(customer_name ORDER BY created_at DESC, display_number DESC SEPARATOR '||'), '||', 1) AS name, SUBSTRING_INDEX(GROUP_CONCAT(customer_phone ORDER BY created_at DESC, display_number DESC SEPARATOR '||'), '||', 1) AS phone, COUNT(*) AS ordersCount, SUM(CASE WHEN status='COMPLETED' THEN total ELSE 0 END) AS totalSpent, SUM(status='COMPLETED') AS completedOrders, MAX(created_at) AS lastOrderAt, MIN(created_at) AS customerSince FROM orders GROUP BY ${sql}, customer_account_id ORDER BY lastOrderAt DESC`,
      { type: QueryTypes.SELECT },
    ),
    CustomerRecord.findAll(),
    CustomerAccount.findAll({ attributes: ["id", "phone", "email"] }),
  ]);
  const recordsByPhone = new Map<string, (typeof records)[number]>(),
    accountsById = new Map(
      accounts.map((account) => [String(account.getDataValue("id")), account]),
    );
  for (const record of records)
    for (const alias of customerAliases(
      record,
      String(record.getDataValue("originalPhone")),
    ))
      recordsByPhone.set(alias, record);
  const merged = new Map<string, Row>();
  for (const row of rows) {
    const account = accountsById.get(String(row.accountId ?? "")),
      accountPhone = normalizeCustomerPhone(account?.getDataValue("phone")),
      orderPhone = normalizeCustomerPhone(row.id);
    const record =
      recordsByPhone.get(accountPhone) || recordsByPhone.get(orderPhone);
    if (record?.getDataValue("deletedAt")) continue;
    const identity = accountPhone || orderPhone;
    if (identity.length < 10 || identity.length > 13) continue;
    const id = String(record?.getDataValue("originalPhone") ?? identity),
      previous = merged.get(id);
    const latest =
      previous &&
      new Date(previous.lastOrderAt).getTime() >
        new Date(row.lastOrderAt).getTime()
        ? previous
        : row;
    const count = Number(row.ordersCount) + Number(previous?.ordersCount ?? 0),
      completed =
        Number(row.completedOrders) + Number(previous?.completedOrders ?? 0),
      total = Number(row.totalSpent) + Number(previous?.totalSpent ?? 0);
    merged.set(id, {
      id,
      name: record?.getDataValue("name") ?? latest.name,
      phone: normalizeCustomerPhone(
        record?.getDataValue("phone") ??
          account?.getDataValue("phone") ??
          latest.phone,
      ),
      email:
        record?.getDataValue("email") ??
        account?.getDataValue("email") ??
        previous?.email ??
        null,
      ordersCount: count,
      completedOrders: completed,
      totalSpent: total,
      averageTicket: completed ? total / completed : 0,
      lastOrderAt: latest.lastOrderAt,
      customerSince:
        previous &&
        new Date(previous.customerSince) < new Date(row.customerSince)
          ? previous.customerSince
          : row.customerSince,
    });
  }
  for (const record of records) {
    const id = String(record.getDataValue("originalPhone"));
    if (!record.getDataValue("deletedAt") && !merged.has(id))
      merged.set(id, {
        id,
        name: record.getDataValue("name"),
        phone: normalizeCustomerPhone(record.getDataValue("phone")),
        email: record.getDataValue("email"),
        ordersCount: 0,
        completedOrders: 0,
        totalSpent: 0,
        averageTicket: 0,
        lastOrderAt: record.getDataValue("createdAt"),
        customerSince: record.getDataValue("createdAt"),
      });
  }
  return [...merged.values()].sort(
    (a, b) =>
      new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime(),
  );
}
