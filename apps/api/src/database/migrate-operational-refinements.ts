import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";
try {
  await sequelize.authenticate();
  for (const [table, name, definition] of [
    ["customer_records", "address", "JSON NULL"],
    ["products", "promotion_days", "JSON NULL"],
    ["products", "promotion_discount_percent", "DECIMAL(5,2) NULL"],
  ]) {
    const rows = await sequelize.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME=:name",
      { replacements: { table, name }, type: QueryTypes.SELECT },
    );
    if (!rows.length)
      await sequelize.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`,
      );
  }
  console.log(
    "Endereço de clientes e agenda de promoções preparados, sem alterar preços ou pedidos existentes.",
  );
} finally {
  await sequelize.close();
}
