import { sequelize } from "./sequelize.js";
await sequelize.authenticate();
await sequelize.query(`CREATE TABLE IF NOT EXISTS inventory_categories (
  id CHAR(36) NOT NULL, name VARCHAR(120) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), UNIQUE KEY uq_inventory_category_name (name)
) ENGINE=InnoDB`);
for (const name of ["Bebidas","Frios","Temperos","Enlatados","Biscoitos","Não alimentos","Carnes"]) {
  await sequelize.query(`INSERT IGNORE INTO inventory_categories (id,name,active) VALUES (UUID(),:name,TRUE)`, { replacements: { name } });
}
await sequelize.query(`CREATE TABLE IF NOT EXISTS inventory_items (
  id CHAR(36) NOT NULL, name VARCHAR(160) NOT NULL, category VARCHAR(120) NOT NULL DEFAULT 'Insumos', unit VARCHAR(20) NOT NULL DEFAULT 'un',
  current_stock DECIMAL(12,3) NOT NULL DEFAULT 0, minimum_stock DECIMAL(12,3) NOT NULL DEFAULT 0, unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id), KEY idx_inventory_status (active, name), CONSTRAINT chk_inventory_stock CHECK (current_stock >= 0 AND minimum_stock >= 0 AND unit_cost >= 0)
) ENGINE=InnoDB`);
await sequelize.query(`CREATE TABLE IF NOT EXISTS inventory_movements (
  id CHAR(36) NOT NULL, inventory_item_id CHAR(36) NOT NULL, type ENUM('IN','OUT','ADJUST') NOT NULL, quantity DECIMAL(12,3) NOT NULL,
  previous_stock DECIMAL(12,3) NOT NULL, resulting_stock DECIMAL(12,3) NOT NULL, reason VARCHAR(160) NOT NULL, notes VARCHAR(500) NULL, created_by VARCHAR(120) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id), KEY idx_inventory_movements_item_created (inventory_item_id, created_at),
  CONSTRAINT fk_inventory_movements_item FOREIGN KEY (inventory_item_id) REFERENCES inventory_items (id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB`);
console.log("Migração do estoque concluída."); await sequelize.close();
