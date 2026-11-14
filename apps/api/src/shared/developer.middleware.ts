import type { RequestHandler } from "express";
export const isDeveloper = (user: { role?: string; isDeveloper?: boolean } | undefined) => user?.role === "ADMIN" && user.isDeveloper === true;
export const requireDeveloper: RequestHandler = (_req, res, next) => {
  if (!isDeveloper(res.locals.user)) { res.status(403).json({ message: "Somente o desenvolvedor pode excluir pedidos ou comandas finalizadas." }); return; }
  next();
};
