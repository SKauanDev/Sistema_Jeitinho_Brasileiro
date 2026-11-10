import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const columns = await sequelize.query<{ COLUMN_NAME: string }>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='store_settings' AND COLUMN_NAME='fixed_delivery_fee'",
    { type: QueryTypes.SELECT },
  );
  if (!columns.length) {
    await sequelize.query("ALTER TABLE store_settings ADD COLUMN fixed_delivery_fee DECIMAL(10, 2) NULL DEFAULT NULL AFTER allow_delivery");
    console.log("Coluna fixed_delivery_fee criada. Taxas regionais existentes continuam valendo ate a taxa fixa ser definida.");
  } else {
    console.log("Coluna fixed_delivery_fee ja existe.");
  }
} finally {
  await sequelize.close();
}
