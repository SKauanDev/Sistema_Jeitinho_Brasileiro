import { Sequelize } from "sequelize";
import { env } from "../config/env.js";

export const sequelize = new Sequelize(
  env.database.name,
  env.database.user,
  env.database.password,
  {
    dialect: "mysql",
    host: env.database.host,
    port: env.database.port,
    logging: env.database.logging ? console.log : false,
    define: { underscored: true, freezeTableName: true },
    dialectOptions: { connectTimeout: env.database.connectTimeoutMs },
    pool: { max: env.database.poolMax, min: env.database.poolMin, acquire: 30_000, idle: env.database.poolIdleMs },
  },
);
