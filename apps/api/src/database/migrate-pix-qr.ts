import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const columns = await sequelize.query<{ COLUMN_NAME: string }>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='pix_qr_code_base64'",
    { type: QueryTypes.SELECT },
  );
  if (!columns.length) {
    await sequelize.query("ALTER TABLE orders ADD COLUMN pix_qr_code_base64 LONGTEXT NULL AFTER pix_copy_paste");
    console.log("Coluna pix_qr_code_base64 criada.");
  } else console.log("Coluna pix_qr_code_base64 ja existe.");
} finally {
  await sequelize.close();
}
