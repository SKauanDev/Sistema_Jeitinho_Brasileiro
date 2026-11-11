import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const columns = await sequelize.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sizes'",
    { type: QueryTypes.SELECT },
  );
  if (!columns.length) await sequelize.query("ALTER TABLE products ADD COLUMN sizes JSON NULL");
  console.log("Tamanhos de pizza preparados; produtos existentes preservados.");
} finally {
  await sequelize.close();
}
