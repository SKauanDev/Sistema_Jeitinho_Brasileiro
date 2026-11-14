import { User } from "./models.js";
import { sequelize } from "./sequelize.js";
const username = process.argv[2];
try {
  if (!username) throw Error("Informe o login do administrador: npm run db:set-developer -w @urfood/api -- login");
  const user = await User.findOne({ where: { username, role: "ADMIN", active: true } });
  if (!user) throw Error("Administrador ativo não encontrado.");
  await user.update({ isDeveloper: true });
  console.log(`Permissão de desenvolvedor atribuída ao administrador ${username}.`);
} finally { await sequelize.close(); }
