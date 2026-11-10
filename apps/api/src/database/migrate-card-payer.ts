import { DataTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const query = sequelize.getQueryInterface();
  const existing = await query.describeTable("orders");
  if (!existing.customer_email) await query.addColumn("orders", "customer_email", { type: DataTypes.STRING(254), allowNull: true });
  if (!existing.customer_document) await query.addColumn("orders", "customer_document", { type: DataTypes.STRING(14), allowNull: true });
  console.log("Dados do pagador dos pedidos preparados.");
} finally {
  await sequelize.close();
}
