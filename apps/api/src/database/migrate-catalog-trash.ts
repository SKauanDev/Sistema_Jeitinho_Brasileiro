import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

await sequelize.authenticate();
const columns = await sequelize.query<{ COLUMN_NAME: string }>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME='trashed_at'", { type: QueryTypes.SELECT });
if (!columns.length) await sequelize.query("ALTER TABLE products ADD COLUMN trashed_at DATETIME(3) NULL AFTER active, ADD KEY idx_products_trashed_at (trashed_at)");
console.log("Migração da lixeira do cardápio concluída.");
await sequelize.close();
