import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  await sequelize.query("ALTER TABLE orders MODIFY status ENUM('NEW','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','READY_OR_ON_ROUTE','COMPLETED','CANCELED') NOT NULL DEFAULT 'NEW'");
  await sequelize.query("ALTER TABLE order_status_history MODIFY status ENUM('NEW','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','READY_OR_ON_ROUTE','COMPLETED','CANCELED') NOT NULL");
  await sequelize.query("UPDATE orders SET status = 'READY' WHERE status = 'READY_OR_ON_ROUTE'");
  await sequelize.query("UPDATE order_status_history SET status = 'READY' WHERE status = 'READY_OR_ON_ROUTE'");
  await sequelize.query("ALTER TABLE orders MODIFY status ENUM('NEW','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','COMPLETED','CANCELED') NOT NULL DEFAULT 'NEW'");
  await sequelize.query("ALTER TABLE order_status_history MODIFY status ENUM('NEW','CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','COMPLETED','CANCELED') NOT NULL");
  const columns = await sequelize.query<{ COLUMN_NAME: string }>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cancellation_reason'", { type: QueryTypes.SELECT });
  if (!columns.length) await sequelize.query("ALTER TABLE orders ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER completed_at");
  await sequelize.query("CREATE TABLE IF NOT EXISTS store_settings (id CHAR(36) NOT NULL, store_name VARCHAR(160) NOT NULL DEFAULT 'La Fiamma Pizzaria', is_open BOOLEAN NOT NULL DEFAULT TRUE, average_preparation_minutes INT UNSIGNED NOT NULL DEFAULT 30, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id)) ENGINE=InnoDB");
  await sequelize.query("INSERT INTO store_settings (id, store_name) SELECT UUID(), 'La Fiamma Pizzaria' WHERE NOT EXISTS (SELECT 1 FROM store_settings)");
  console.log("Migração administrativa aplicada com sucesso.");
} catch (error) {
  console.error("Falha na migração administrativa:", error); process.exitCode = 1;
} finally { await sequelize.close(); }
