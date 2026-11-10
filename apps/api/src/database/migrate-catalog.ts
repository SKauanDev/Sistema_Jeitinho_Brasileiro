import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

async function addColumn(name: string, definition: string) {
  const rows = await sequelize.query<{ COLUMN_NAME: string }>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = :name", { replacements: { name }, type: QueryTypes.SELECT });
  if (!rows.length) await sequelize.query(`ALTER TABLE products ADD COLUMN ${name} ${definition}`);
}

await sequelize.authenticate();
await addColumn("promotional_price", "DECIMAL(10,2) NULL AFTER price");
await addColumn("featured", "BOOLEAN NOT NULL DEFAULT FALSE AFTER promotional_price");
await addColumn("pizza_slots", "INT UNSIGNED NOT NULL DEFAULT 0 AFTER featured");
console.log("Migração do catálogo concluída.");
await sequelize.close();
