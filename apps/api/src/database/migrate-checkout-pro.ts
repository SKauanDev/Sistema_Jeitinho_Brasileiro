import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const columns = await sequelize.query<{ COLUMN_NAME: string }>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='payment_checkout_url'",
    { type: QueryTypes.SELECT },
  );
  if (!columns.length) {
    await sequelize.query("ALTER TABLE orders ADD COLUMN payment_checkout_url TEXT NULL AFTER pix_copy_paste");
    console.log("Coluna payment_checkout_url criada.");
  } else console.log("Coluna payment_checkout_url ja existe.");
} finally {
  await sequelize.close();
}
