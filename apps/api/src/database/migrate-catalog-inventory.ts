import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

await sequelize.authenticate();
const hasColumn = async (table: string, column: string) => Boolean((await sequelize.query(
  "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME=:column",
  { replacements: { table, column }, type: QueryTypes.SELECT },
)).length);

if (!await hasColumn("inventory_items", "product_id")) await sequelize.query("ALTER TABLE inventory_items ADD COLUMN product_id CHAR(36) NULL AFTER id, ADD UNIQUE KEY uq_inventory_items_product (product_id), ADD CONSTRAINT fk_inventory_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE SET NULL");
if (!await hasColumn("inventory_movements", "order_id")) await sequelize.query("ALTER TABLE inventory_movements ADD COLUMN order_id CHAR(36) NULL AFTER inventory_item_id, ADD KEY idx_inventory_movements_order (order_id), ADD CONSTRAINT fk_inventory_movements_order FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE SET NULL");
if (!await hasColumn("inventory_movements", "source_id")) await sequelize.query("ALTER TABLE inventory_movements ADD COLUMN source_id VARCHAR(120) NULL AFTER order_id, ADD UNIQUE KEY uq_inventory_movements_source (source_id)");
if (!await hasColumn("orders", "inventory_processed_at")) await sequelize.query("ALTER TABLE orders ADD COLUMN inventory_processed_at DATETIME(3) NULL AFTER cancellation_reason");
if (!await hasColumn("orders", "inventory_reverted_at")) await sequelize.query("ALTER TABLE orders ADD COLUMN inventory_reverted_at DATETIME(3) NULL AFTER inventory_processed_at");
console.log("Migração da integração cardápio/estoque concluída.");
await sequelize.close();
