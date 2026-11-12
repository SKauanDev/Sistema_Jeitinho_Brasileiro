import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const columns = await sequelize.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inventory_items' AND COLUMN_NAME='removed_at'", { type: QueryTypes.SELECT });
  if (!columns.length) await sequelize.query("ALTER TABLE inventory_items ADD COLUMN removed_at DATETIME(3) NULL");
  console.log("Exclusão de estoque preparada; saldos e movimentações existentes preservados.");
} finally { await sequelize.close(); }
