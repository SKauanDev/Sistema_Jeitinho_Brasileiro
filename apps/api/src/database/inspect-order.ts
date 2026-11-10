import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  const number = Number(process.argv[2]);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Informe o número do pedido.");
  const rows = await sequelize.query("SELECT display_number, status, payment_method, payment_status, cancellation_reason, created_at FROM orders WHERE display_number = :number", { replacements: { number }, type: QueryTypes.SELECT });
  console.log(JSON.stringify(rows, null, 2));
} finally { await sequelize.close(); }
