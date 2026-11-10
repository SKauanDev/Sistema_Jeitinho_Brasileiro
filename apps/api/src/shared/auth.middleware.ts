import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { resolveIdentity } from "../realtime/socket-security.js";

export function createRequireAuth(resolve = resolveIdentity) {
return async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  response.setHeader("Cache-Control", "private, no-store");
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) { response.status(401).json({ message: "Autenticação obrigatória." }); return; }
  try {
    if (token.length > 4096) throw new Error();
    const claims = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    if (typeof claims === "string" || claims.role === "ORDER_TRACKING") throw new Error();
    const identity = await resolve(claims);
    if (!identity) throw new Error();
    response.locals.user = { ...claims, ...identity };
    next();
  } catch {
    response.status(401).json({ message: "Sessão inválida ou expirada." });
  }
};
}
export const requireAuth = createRequireAuth();

export function requireAdmin(_request: Request, response: Response, next: NextFunction): void {
  const user = response.locals.user as { role?: string } | undefined;
  if (user?.role !== "ADMIN" && user?.role !== "OPERATOR") { response.status(403).json({ message: "Sem permissão para esta operação." }); return; }
  next();
}

export function requireSuperAdmin(_request: Request, response: Response, next: NextFunction): void {
  const user = response.locals.user as { role?: string } | undefined;
  if (user?.role !== "ADMIN") { response.status(403).json({ message: "Apenas o administrador pode gerenciar usuários." }); return; }
  next();
}
