import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";
import { CustomerRecord, DeletionLog } from "./models.js";
try {
  await sequelize.authenticate();
  const columns = await sequelize.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='is_developer'", { type: QueryTypes.SELECT });
  if (!columns.length) await sequelize.query("ALTER TABLE users ADD COLUMN is_developer TINYINT(1) NOT NULL DEFAULT 0");
  await CustomerRecord.sync(); await DeletionLog.sync();
  console.log("Gestão de clientes e permissão de exclusão preparadas. Nenhuma conta recebe permissão automaticamente.");
} finally { await sequelize.close(); }
