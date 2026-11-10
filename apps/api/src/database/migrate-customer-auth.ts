import { sequelize } from "./sequelize.js";
await sequelize.authenticate();
await sequelize.query(`CREATE TABLE IF NOT EXISTS customer_accounts (
  id CHAR(36) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), UNIQUE KEY uq_customer_accounts_phone (phone)
) ENGINE=InnoDB`);
await sequelize.query(`CREATE TABLE IF NOT EXISTS customer_coupons (
  id CHAR(36) NOT NULL,
  customer_account_id CHAR(36) NOT NULL,
  coupon_id CHAR(36) NOT NULL,
  coupon_code VARCHAR(50) NOT NULL,
  redeemed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_coupon (customer_account_id, coupon_id),
  KEY idx_customer_coupon_account (customer_account_id)
) ENGINE=InnoDB`);
console.log("Contas e cupons de clientes preparados.");
await sequelize.close();
