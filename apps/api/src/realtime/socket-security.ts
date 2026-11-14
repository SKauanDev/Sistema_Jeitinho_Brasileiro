import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Server } from "socket.io";
import { env } from "../config/env.js";
import { CustomerAccount, Order, User } from "../database/models.js";

export const ADMIN_ROOM = "admin:authenticated";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const phone = (value: unknown) => String(value ?? "").replace(/\D/g, "");
export type SocketIdentity = { role: "ADMIN" | "OPERATOR" | "KITCHEN" | "CUSTOMER" | "ORDER_TRACKING"; isDeveloper?: boolean; sub?: string; phone?: string; orderId?: string; exp: number };
export const orderTrackingToken = (orderId: string) => jwt.sign({ role: "ORDER_TRACKING", orderId }, env.jwtSecret, { expiresIn: "7d", audience: "urfood-order-tracking" });

export async function resolveIdentity(claims: JwtPayload): Promise<SocketIdentity | null> {
  if (!claims.exp || claims.exp * 1000 <= Date.now()) return null;
  if (claims.role === "ORDER_TRACKING") {
    if (claims.aud !== "urfood-order-tracking" || typeof claims.orderId !== "string" || !uuid.test(claims.orderId)) return null;
    return { role: "ORDER_TRACKING", orderId: claims.orderId, exp: claims.exp };
  }
  if (typeof claims.sub !== "string") return null;
  if (["ADMIN", "OPERATOR", "KITCHEN"].includes(claims.role)) {
    const account = await User.findByPk(claims.sub);
    if (!account?.getDataValue("active") || account.getDataValue("role") !== claims.role) return null;
    return { role: claims.role, sub: claims.sub, exp: claims.exp, isDeveloper: Boolean(account.getDataValue("isDeveloper")) };
  }
  if (claims.role === "CUSTOMER") {
    const account = await CustomerAccount.findByPk(claims.sub);
    if (!account?.getDataValue("active")) return null;
    return { role: "CUSTOMER", sub: claims.sub, phone: phone(account.getDataValue("phone")), exp: claims.exp };
  }
  return null;
}
async function canWatch(identity: SocketIdentity, id: string) {
  if (identity.role === "ORDER_TRACKING") return identity.orderId === id;
  if (identity.role === "KITCHEN") return false;
  const order = await Order.findByPk(id, { attributes: ["id", "customerAccountId"] });
  if (!order) return false;
  return identity.role !== "CUSTOMER" || order.getDataValue("customerAccountId") === identity.sub;
}

export function configureSocketSecurity(io: Server, dependencies = { resolveIdentity, canWatch }) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || token.length > 4096) throw new Error();
      const claims = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
      if (typeof claims === "string") throw new Error();
      const identity = await dependencies.resolveIdentity(claims);
      if (!identity || identity.exp * 1000 <= Date.now()) throw new Error();
      socket.data.identity = identity; next();
    } catch { next(new Error("Sessão inválida ou expirada.")); }
  });
  io.on("connection", socket => {
    const identity = socket.data.identity as SocketIdentity;
    if (["ADMIN", "OPERATOR", "KITCHEN"].includes(identity.role)) void socket.join(ADMIN_ROOM);
    const timeout = setTimeout(() => socket.disconnect(true), Math.min(2147483647, Math.max(0, identity.exp * 1000 - Date.now())));
    timeout.unref(); socket.on("disconnect", () => clearTimeout(timeout));
    const revalidate = setInterval(() => {
      const token = socket.handshake.auth.token;
      void Promise.resolve().then(async () => {
        const claims = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
        if (typeof claims === "string" || !await dependencies.resolveIdentity(claims)) socket.disconnect(true);
      }).catch(() => socket.disconnect(true));
    }, 60000);
    revalidate.unref(); socket.on("disconnect", () => clearInterval(revalidate));
    socket.emit("connected", { socketId: socket.id });
    let count = 0; let windowStart = Date.now();
    const subscriptions = new Set<string>();
    socket.on("watch:order", async (id: unknown, acknowledge?: unknown) => {
      const reply = (ok: boolean) => { if (typeof acknowledge === "function") acknowledge({ ok, ...(!ok ? { message: "Acesso ao pedido não autorizado ou limite atingido." } : {}) }); };
      if (Date.now() - windowStart >= 60000) { count = 0; windowStart = Date.now(); }
      if (++count > 60 || typeof id !== "string" || !uuid.test(id) || (!subscriptions.has(id) && subscriptions.size >= 50) || identity.exp * 1000 <= Date.now()) { reply(false); return; }
      try {
        if (!await dependencies.canWatch(identity, id) || !socket.connected || identity.exp * 1000 <= Date.now() || (!subscriptions.has(id) && subscriptions.size >= 50)) { reply(false); return; }
        subscriptions.add(id); await socket.join(`order:${id}`); reply(true);
      } catch { reply(false); }
    });
    socket.on("unwatch:order", (id: unknown) => { if (typeof id === "string" && uuid.test(id)) { subscriptions.delete(id); void socket.leave(`order:${id}`); } });
  });
}
