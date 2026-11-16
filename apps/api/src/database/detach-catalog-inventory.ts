import { sequelize } from "./sequelize.js";
import { detachCatalogInventory } from "../modules/inventory/detach-catalog-inventory.js";
try {
  await sequelize.authenticate();
  console.log(
    "Estoque independente do cardápio:",
    await detachCatalogInventory(),
  );
} finally {
  await sequelize.close();
}
