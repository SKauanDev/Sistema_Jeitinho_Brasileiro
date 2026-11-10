import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const existing = await sequelize.query<{ COLUMN_NAME: string }>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='digital_security_fee'",
    { type: QueryTypes.SELECT },
  );
  if (!existing.length) {
    await sequelize.query("ALTER TABLE orders ADD COLUMN digital_security_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER delivery_fee");
    console.log("Coluna digital_security_fee criada; pedidos antigos permanecem sem cobrança adicional.");
  } else {
    console.log("Coluna digital_security_fee já existe.");
  }
  const invalid = await sequelize.query<{ amount: number }>(
    "SELECT COUNT(*) AS amount FROM orders WHERE ABS(total - (subtotal + delivery_fee + digital_security_fee - discount_amount)) > 0.001",
    { type: QueryTypes.SELECT },
  );
  if (Number(invalid[0]?.amount ?? 0) > 0) {
    throw new Error(`${invalid[0]?.amount ?? 0} pedido(s) existentes não obedecem ao total esperado; revise-os antes de atualizar a regra.`);
  }
  const constraint = await sequelize.query<{ CHECK_CLAUSE: string }>(
    "SELECT cc.CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='orders' AND tc.CONSTRAINT_NAME='chk_orders_total'",
    { type: QueryTypes.SELECT },
  );
  if (!constraint[0]?.CHECK_CLAUSE?.includes("digital_security_fee")) {
    if (constraint.length) await sequelize.query("ALTER TABLE orders DROP CONSTRAINT chk_orders_total");
    await sequelize.query("ALTER TABLE orders ADD CONSTRAINT chk_orders_total CHECK (total = subtotal + delivery_fee + digital_security_fee - discount_amount)");
    console.log("Regra chk_orders_total atualizada para incluir a taxa LGPD.");
  } else {
    console.log("Regra chk_orders_total já inclui a taxa LGPD.");
  }
} finally {
  await sequelize.close();
}
