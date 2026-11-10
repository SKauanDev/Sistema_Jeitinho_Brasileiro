import "./models.js";
import { sequelize } from "./sequelize.js";

try {
  await sequelize.authenticate();
  console.log("Conexão com o MySQL estabelecida com sucesso.");
} catch (error) {
  console.error("Não foi possível conectar ao MySQL:", error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
