import { sequelize } from "./sequelize.js";

await sequelize.authenticate();
await sequelize.query(`CREATE TABLE IF NOT EXISTS product_images (
  id CHAR(36) NOT NULL,
  category_id CHAR(36) NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  size INT UNSIGNED NOT NULL,
  data LONGBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_product_images_category (category_id),
  CONSTRAINT fk_product_images_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB`);
console.log("Migração de imagens de produtos concluída.");
await sequelize.close();
