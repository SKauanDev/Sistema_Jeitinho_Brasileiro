import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const columns = await sequelize.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='customer_account_id'", { type: QueryTypes.SELECT });
  if (!columns.length) {
    await sequelize.query("ALTER TABLE orders ADD COLUMN customer_account_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL, ADD KEY idx_orders_customer_account (customer_account_id), ADD CONSTRAINT fk_orders_customer_account FOREIGN KEY (customer_account_id) REFERENCES customer_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL");
    // Preserve links for accounts that existed before this security migration.
    // Future signups claim only the order they can prove they created.
    await sequelize.query("UPDATE orders o JOIN customer_accounts a ON REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(o.customer_phone,'(',''),')',''),'-',''),' ',''),'+','')=a.phone COLLATE utf8mb4_unicode_ci SET o.customer_account_id=a.id WHERE o.customer_account_id IS NULL");
  }
  console.log("Vínculo de propriedade dos pedidos preparado.");
} finally { await sequelize.close(); }
