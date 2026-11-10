import { hash } from "bcryptjs";
import { Router } from "express";
import { UniqueConstraintError } from "sequelize";
import { User } from "../../database/models.js";
import { requireAuth, requireSuperAdmin } from "../../shared/auth.middleware.js";

export const userRouter = Router();
userRouter.use(requireAuth, requireSuperAdmin);

const publicAttributes = ["id", "name", "username", "email", "role", "active", "createdAt", "updatedAt"];
const normalizeUsername = (value: unknown) => String(value ?? "").trim().toLowerCase();

function validationError(error: unknown) {
  if (error instanceof UniqueConstraintError) return "Usuário ou e-mail já cadastrado.";
  return null;
}

userRouter.get("/", async (_request, response) => {
  const users = await User.findAll({ attributes: publicAttributes, order: [["role", "ASC"], ["name", "ASC"]] });
  response.json(users);
});

userRouter.post("/", async (request, response) => {
  const name = String(request.body.name ?? "").trim();
  const username = normalizeUsername(request.body.username);
  const email = String(request.body.email ?? "").trim().toLowerCase();
  const password = String(request.body.password ?? "");
  if (name.length < 3) { response.status(400).json({ message: "Informe o nome completo do usuário." }); return; }
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) { response.status(400).json({ message: "O usuário deve ter de 3 a 40 caracteres, sem espaços." }); return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { response.status(400).json({ message: "Informe um e-mail válido." }); return; }
  if (password.length < 8) { response.status(400).json({ message: "A senha deve possuir pelo menos 8 caracteres." }); return; }
  try {
    const user = await User.create({ name, username, email, passwordHash: await hash(password, 12), role: "OPERATOR", active: true });
    response.status(201).json(await User.findByPk(user.getDataValue("id"), { attributes: publicAttributes }));
  } catch (error) {
    const message = validationError(error); if (message) { response.status(409).json({ message }); return; } throw error;
  }
});

userRouter.patch("/:id", async (request, response) => {
  const user = await User.findByPk(request.params.id);
  if (!user) { response.status(404).json({ message: "Usuário não encontrado." }); return; }
  if (user.getDataValue("role") === "ADMIN") { response.status(403).json({ message: "O administrador fixo não pode ser alterado por este módulo." }); return; }
  const changes: Record<string, unknown> = {};
  if (request.body.name !== undefined) { const name = String(request.body.name).trim(); if (name.length < 3) { response.status(400).json({ message: "Informe o nome completo do usuário." }); return; } changes.name = name; }
  if (request.body.username !== undefined) { const username = normalizeUsername(request.body.username); if (!/^[a-z0-9._-]{3,40}$/.test(username)) { response.status(400).json({ message: "Usuário inválido." }); return; } changes.username = username; }
  if (request.body.email !== undefined) { const email = String(request.body.email).trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) { response.status(400).json({ message: "Informe um e-mail válido." }); return; } changes.email = email; }
  if (typeof request.body.active === "boolean") changes.active = request.body.active;
  if (request.body.password) { const password = String(request.body.password); if (password.length < 8) { response.status(400).json({ message: "A senha deve possuir pelo menos 8 caracteres." }); return; } changes.passwordHash = await hash(password, 12); }
  try {
    await user.update(changes);
    response.json(await User.findByPk(user.getDataValue("id"), { attributes: publicAttributes }));
  } catch (error) {
    const message = validationError(error); if (message) { response.status(409).json({ message }); return; } throw error;
  }
});
