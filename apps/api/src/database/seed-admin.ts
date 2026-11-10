import { hash } from "bcryptjs";
import { QueryTypes } from "sequelize";
import { User } from "./models.js";
import { sequelize } from "./sequelize.js";

const username = "devk";
const password = "devk123@!";

try {
  await sequelize.authenticate();

  const columns = await sequelize.query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'username'`,
    { type: QueryTypes.SELECT },
  );

  if (columns.length === 0) {
    await sequelize.query(
      "ALTER TABLE users ADD COLUMN username VARCHAR(80) NULL AFTER name, ADD UNIQUE KEY uq_users_username (username)",
    );
  }

  const passwordHash = await hash(password, 12);
  const existing = await User.findOne({ where: { username } });

  if (existing) {
    await existing.update({
      name: "Administrador DevK",
      email: "devk@urfood.local",
      passwordHash,
      role: "ADMIN",
      active: true,
    });
    console.log("Usuário administrador atualizado com sucesso.");
  } else {
    await User.create({
      name: "Administrador DevK",
      username,
      email: "devk@urfood.local",
      passwordHash,
      role: "ADMIN",
      active: true,
    });
    console.log("Usuário administrador criado com sucesso.");
  }
} catch (error) {
  console.error("Falha ao criar o administrador:", error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
