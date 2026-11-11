import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  await sequelize.query("ALTER TABLE users MODIFY role ENUM('ADMIN','OPERATOR','KITCHEN') NOT NULL DEFAULT 'OPERATOR'");
  console.log("Perfil Cozinha habilitado; usuários existentes preservados.");
} finally {
  await sequelize.close();
}
