import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

async function addColumn(table: string, name: string, definition: string) {
  const rows = await sequelize.query<{ COLUMN_NAME: string }>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME=:name", { replacements: { table, name }, type: QueryTypes.SELECT });
  if (!rows.length) await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

await sequelize.authenticate();
await addColumn("orders", "payment_status", "ENUM('NOT_REQUIRED','PENDING','APPROVED','REJECTED','EXPIRED') NOT NULL DEFAULT 'NOT_REQUIRED' AFTER payment_method");
await addColumn("orders", "payment_provider", "VARCHAR(40) NULL AFTER payment_status");
await addColumn("orders", "payment_external_id", "VARCHAR(100) NULL UNIQUE AFTER payment_provider");
await addColumn("orders", "payment_expires_at", "DATETIME(3) NULL AFTER payment_external_id");
await addColumn("orders", "pix_copy_paste", "TEXT NULL AFTER payment_expires_at");
await addColumn("orders", "paid_at", "DATETIME(3) NULL AFTER pix_copy_paste");
await addColumn("financial_entries", "source_id", "VARCHAR(100) NULL UNIQUE AFTER created_by");
console.log("Migração de pagamentos concluída.");
await sequelize.close();
