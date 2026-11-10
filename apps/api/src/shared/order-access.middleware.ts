import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Order } from "../database/models.js";
import { resolveIdentity } from "../realtime/socket-security.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const findOwner = async (id: string) => {
  const order = await Order.findByPk(id, { attributes: ["customerAccountId"] });
  return order?.getDataValue("customerAccountId") ? String(order.getDataValue("customerAccountId")) : null;
};

export function createOrderAccess(resolve = resolveIdentity, orderOwner = findOwner): RequestHandler {
  return async (request, response, next) => {
    response.setHeader("Cache-Control", "private, no-store");
    const orderId = String(request.params.orderId ?? request.params.id ?? "");
    if (!uuid.test(orderId)) { response.status(404).json({ message: "Pedido não encontrado." }); return; }
    const tokens = [request.header("Authorization")?.replace(/^Bearer\s+/i, ""), request.header("X-Order-Token")].filter((value): value is string => !!value);
    for (const token of tokens) {
      try {
        if (token.length > 4096) continue;
        const claims = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
        if (typeof claims === "string") continue;
        const identity = await resolve(claims);
        if (!identity) continue;
        const allowed = identity.role === "ORDER_TRACKING" ? identity.orderId === orderId
          : identity.role === "CUSTOMER" ? !!identity.sub && identity.sub === await orderOwner(orderId)
          : identity.role === "ADMIN" || identity.role === "OPERATOR";
        if (allowed) { next(); return; }
      } catch { /* Try the independent tracking capability when a login has expired. */ }
    }
    response.status(tokens.length ? 403 : 401).json({ message: "Entre na sua conta ou abra o pedido no dispositivo em que ele foi criado." });
  };
}
export const requireOrderAccess = createOrderAccess();
