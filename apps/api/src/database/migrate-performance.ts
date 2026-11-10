import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

// Additive and repeatable; execute after the feature migrations and before production.
const indexes = [
  { table: "products", name: "idx_products_category_visible", columns: ["category_id", "active", "trashed_at", "position"] },
  { table: "orders", name: "idx_orders_customer_created", columns: ["customer_phone", "created_at"] },
  { table: "orders", name: "idx_orders_payment_expiration", columns: ["payment_status", "payment_method", "created_at"] },
  { table: "orders", name: "idx_orders_created", columns: ["created_at"] },
  { table: "order_items", name: "idx_order_items_product_order", columns: ["product_id", "order_id"] },
  { table: "financial_entries", name: "idx_financial_entries_date", columns: ["entry_date"] },
];

try {
  await sequelize.authenticate();
  for (const index of indexes) {
    const columns = await sequelize.query<{ COLUMN_NAME: string }>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table",
      { replacements: { table: index.table }, type: QueryTypes.SELECT },
    );
    if (!index.columns.every(name => columns.some(column => column.COLUMN_NAME === name))) {
      throw new Error(`Execute primeiro as migrações do módulo: ${index.table}.`);
    }
    const existing = await sequelize.query<{ INDEX_NAME: string; COLUMN_NAME: string; SEQ_IN_INDEX: number }>(
      "SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table ORDER BY INDEX_NAME, SEQ_IN_INDEX",
      { replacements: { table: index.table }, type: QueryTypes.SELECT },
    );
    const groups = new Map<string, string[]>();
    for (const row of existing) groups.set(row.INDEX_NAME, [...(groups.get(row.INDEX_NAME) ?? []), row.COLUMN_NAME]);
    if ([...groups.values()].some(fields => index.columns.every((column, position) => fields[position] === column))) continue;
    if (groups.has(index.name)) throw new Error(`Índice ${index.name} já existe com outra definição.`);
    await sequelize.query(`CREATE INDEX \`${index.name}\` ON \`${index.table}\` (${index.columns.map(column => `\`${column}\``).join(", ")})`);
    console.log(`Índice criado: ${index.name}`);
  }
  console.log("Índices de desempenho conferidos.");
} finally { await sequelize.close(); }
