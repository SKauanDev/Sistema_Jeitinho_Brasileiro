import { Router } from "express";
import { Courier } from "../../database/models.js";
import { requireAdmin, requireAuth } from "../../shared/auth.middleware.js";
import { courierPhone } from "./courier-phone.js";
export const courierRouter = Router();
courierRouter.use(requireAuth, requireAdmin);
courierRouter.get("/", async (_req, res) => res.json(await Courier.findAll({ order: [["name", "ASC"]] })));
courierRouter.post("/", async (req, res) => {
  const name = String(req.body.name ?? "").trim();
  let phone: string;
  try { phone = courierPhone(req.body.phone); } catch (error) { res.status(400).json({ message: (error as Error).message }); return; }
  if (!name || name.length > 120 || phone.length > 30) { res.status(400).json({ message: "Informe nome e telefone válidos." }); return; }
  res.status(201).json(await Courier.create({ name, phone, active: true }));
});
courierRouter.patch("/:id", async (req, res) => {
  const courier = await Courier.findByPk(String(req.params.id));
  if (!courier) { res.status(404).end(); return; }
  const name = String(req.body.name ?? courier.getDataValue("name")).trim();
  let phone: string;
  try { phone = req.body.phone === undefined ? String(courier.getDataValue("phone") ?? "") : courierPhone(req.body.phone); } catch (error) { res.status(400).json({ message: (error as Error).message }); return; }
  if (!name || name.length > 120 || phone.length > 30 || (req.body.active !== undefined && typeof req.body.active !== "boolean")) { res.status(400).json({ message: "Dados do motoboy inválidos." }); return; }
  await courier.update({ name, phone, active: req.body.active ?? courier.getDataValue("active") }); res.json(courier);
});
courierRouter.delete("/:id", async (req, res) => {
  const courier = await Courier.findByPk(String(req.params.id));
  if (!courier) { res.status(404).json({ message: "Motoboy não encontrado." }); return; }
  // Orders carry their own ID/name snapshot; historical delivery fees remain
  // attributable after this registration is removed.
  await courier.destroy(); res.status(204).end();
});
