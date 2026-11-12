import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";
import { DiningSession, DiningTable } from "./models.js";

try {
  await sequelize.authenticate();
  for (const [table, column, definition] of [
    ["store_settings", "pizza_rules", "JSON NULL"],
    ["store_settings", "table_count", "INT UNSIGNED NOT NULL DEFAULT 40"],
    ["orders", "dining_session_id", "CHAR(36) NULL"],
    ["orders", "table_number", "INT UNSIGNED NULL"],
  ]) {
    const columns = await sequelize.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME=:column", { replacements: { table, column }, type: QueryTypes.SELECT });
    if (!columns.length) await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
  await sequelize.query("ALTER TABLE orders MODIFY payment_method ENUM('PIX','CASH','CREDIT_CARD','DEBIT_CARD','ONLINE','RECEIVED_ONLINE') NULL");
  await DiningTable.sync();
  await DiningSession.sync();
  const indexes = await sequelize.getQueryInterface().showIndex("orders") as Array<{ name: string }>;
  if (!indexes.some(index => index.name === "orders_dining_session")) await sequelize.getQueryInterface().addIndex("orders", ["dining_session_id"], { name: "orders_dining_session" });
  console.log("Bordas, preços de pizzas e comandas preparados. Histórico preservado.");
} finally { await sequelize.close(); }
