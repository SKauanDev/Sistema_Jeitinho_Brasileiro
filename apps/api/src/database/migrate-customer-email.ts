import { DataTypes } from "sequelize";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  const query = sequelize.getQueryInterface();
  const existing = await query.describeTable("customer_accounts");
  const columns = {
    email: { type: DataTypes.STRING(254), allowNull: true },
    email_verified_at: { type: DataTypes.DATE, allowNull: true },
    pending_email: { type: DataTypes.STRING(254), allowNull: true },
    email_code_hash: { type: DataTypes.STRING(64), allowNull: true },
    email_code_purpose: { type: DataTypes.STRING(20), allowNull: true },
    email_code_expires_at: { type: DataTypes.DATE, allowNull: true },
    email_code_sent_at: { type: DataTypes.DATE, allowNull: true },
    email_code_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  };
  for (const [name, column] of Object.entries(columns)) if (!existing[name]) await query.addColumn("customer_accounts", name, column);
  console.log("Campos de recuperação por e-mail preparados (sem alterar contas existentes).");
} finally { await sequelize.close(); }
