import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth, requireAdmin } from "../../shared/auth.middleware.js";
import { getStoreSetting } from "../settings/store-operation.service.js";
import { parseSizes, PizzaValidationError, type SizePrice } from "./pizza-sizes.js";
import { parseStyleMenus, type PizzaMenu } from "./pizza-style-menu.js";

export type PizzaRules = { menus?: PizzaMenu[]; traditional: SizePrice[]; mixed: SizePrice[]; borders: Array<{ id: string; name: string; type: "SAVORY" | "SWEET"; price: number; active: boolean }> };
export const emptyPizzaRules = (): PizzaRules => ({ traditional: [], mixed: [], borders: [] });
export function readPizzaRules(value: unknown): PizzaRules {
  if (!value || typeof value !== "object") return emptyPizzaRules();
  return { ...emptyPizzaRules(), ...value } as PizzaRules;
}
export function pizzaKind(category: string): "SWEET" | "PREMIUM" | "TRADITIONAL" {
  return /doc[eê]/i.test(category) ? "SWEET" : /premium/i.test(category) ? "PREMIUM" : "TRADITIONAL";
}
export const pizzaRulesRouter = Router();
pizzaRulesRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
pizzaRulesRouter.get("/", async (_req, res) => res.json(readPizzaRules((await getStoreSetting()).getDataValue("pizzaRules"))));
pizzaRulesRouter.put("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const input = req.body;
    if (!input || !Array.isArray(input.borders) || input.borders.length > 50) throw new PizzaValidationError("Configure até 50 bordas.");
    const rules: PizzaRules = { traditional: parseSizes(input.traditional), mixed: parseSizes(input.mixed), borders: input.borders.map((border: any) => {
      if (!border || !String(border.name ?? "").trim() || String(border.name).length > 80 || !["SAVORY", "SWEET"].includes(border.type) || typeof border.price !== "number" || !Number.isFinite(border.price) || border.price < 0 || border.price > 99999) throw new PizzaValidationError("Informe nome, tipo e preço válido para cada borda.");
      const id = border.id || randomUUID();
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new PizzaValidationError("Identificação da borda inválida.");
      return { id, name: border.name.trim(), type: border.type, price: Math.round(border.price * 100) / 100, active: border.active !== false };
    }) };
    if (new Set(rules.borders.map(border => border.id)).size !== rules.borders.length) throw new PizzaValidationError("Bordas duplicadas.");
    const setting = await getStoreSetting();
    rules.menus = parseStyleMenus(input.menus === undefined ? readPizzaRules(setting.getDataValue("pizzaRules")).menus : input.menus, new Set(rules.borders.map(border => border.id)));
    await setting.update({ pizzaRules: rules });
    res.json(rules);
  } catch (error) { if (!(error instanceof PizzaValidationError)) throw error; res.status(400).json({ message: error.message }); }
});
