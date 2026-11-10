import { compare } from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { User } from "../../database/models.js";

export const authRouter = Router();

authRouter.post("/login", async (request, response) => {
  const { username, password } = request.body as { username?: string; password?: string };

  if (!username || !password) {
    response.status(400).json({ message: "Informe usuário e senha." });
    return;
  }

  const user = await User.findOne({ where: { username, active: true } });
  if (!user || !(await compare(password, String(user.getDataValue("passwordHash"))))) {
    response.status(401).json({ message: "Usuário ou senha inválidos." });
    return;
  }

  const payload = {
    sub: String(user.getDataValue("id")),
    username: String(user.getDataValue("username")),
    role: String(user.getDataValue("role")),
  };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "8h" });

  response.json({
    token,
    user: {
      id: payload.sub,
      name: String(user.getDataValue("name")),
      username: payload.username,
      role: payload.role,
    },
  });
});
