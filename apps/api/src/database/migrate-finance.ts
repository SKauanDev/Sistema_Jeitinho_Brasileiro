import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";
async function addOrderColumn(name: string, definition: string) { const rows = await sequelize.query<{ COLUMN_NAME: string }>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = :name", { replacements: { name }, type: QueryTypes.SELECT }); if (!rows.length) await sequelize.query(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`); }
await sequelize.authenticate();
await addOrderColumn("payment_method", "ENUM('PIX','CASH','CREDIT_CARD','DEBIT_CARD','ONLINE') NULL AFTER total");
await addOrderColumn("change_for", "DECIMAL(10,2) NULL AFTER payment_method");
await sequelize.query(`CREATE TABLE IF NOT EXISTS financial_entries (id CHAR(36) NOT NULL, type ENUM('IN','OUT') NOT NULL, category VARCHAR(120) NOT NULL, description VARCHAR(255) NOT NULL, amount DECIMAL(12,2) NOT NULL, entry_date DATE NOT NULL, notes VARCHAR(500) NULL, created_by VARCHAR(120) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id), KEY idx_financial_entries_date_type (entry_date, type), CONSTRAINT chk_financial_amount CHECK (amount > 0)) ENGINE=InnoDB`);
console.log("Migração financeira concluída."); await sequelize.close();
