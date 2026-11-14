import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";
import { Courier, OrderEdit } from "./models.js";
try {
  await sequelize.authenticate();
  let changed = false;
  const additions = [
    ["orders", "courier_id", "CHAR(36) NULL"], ["orders", "courier_name", "VARCHAR(120) NULL"],
    ["orders", "service_fee", "DECIMAL(10,2) NOT NULL DEFAULT 0"], ["orders", "service_fee_accepted", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["orders", "inventory_revision", "INT UNSIGNED NOT NULL DEFAULT 0"], ["products", "ingredients", "JSON NULL"],
  ];
  for (const [table, column, definition] of additions) {
    const exists = await sequelize.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?", { replacements: [table, column], type: QueryTypes.SELECT });
    if (!exists.length) { await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); changed = true; }
  }
  await Courier.sync(); await OrderEdit.sync();
  if (changed) await sequelize.query("UPDATE store_settings SET online_payment_enabled=1");
  const constraints = await sequelize.query<{ CHECK_CLAUSE: string }>("SELECT cc.CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_SCHEMA=DATABASE() AND tc.TABLE_NAME='orders' AND tc.CONSTRAINT_NAME='chk_orders_total'", { type: QueryTypes.SELECT });
  if (!constraints[0]?.CHECK_CLAUSE.includes("service_fee")) {
    await sequelize.query(`ALTER TABLE orders ${constraints.length ? "DROP CHECK chk_orders_total, " : ""}ADD CONSTRAINT chk_orders_total CHECK (total = subtotal + delivery_fee + digital_security_fee + service_fee - discount_amount AND service_fee >= 0)`);
  }
  console.log("Motoboys, taxa de serviço, revisão de pedidos e ingredientes preparados; dados anteriores preservados.");
} finally { await sequelize.close(); }
