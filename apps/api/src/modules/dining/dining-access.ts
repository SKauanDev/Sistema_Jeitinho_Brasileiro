import { createHash } from "node:crypto";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { allowedWebOrigins } from "../../config/web-origins.js";

export const DINING_DENIED = "Não autorizado, validado apenas pelo sistema.";
const audience = "dining-table";
const issuer = "urfood-dining";
const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");
export type DiningAccess = { table: string; sessionId: string | null };

export function issueDiningAccess(key: string, sessionId: string | null) {
  return jwt.sign({ table: keyHash(key), sessionId }, env.jwtSecret, {
    algorithm: "HS256", issuer, audience, expiresIn: sessionId ? "4h" : "5m",
  });
}
export function readDiningAccess(request: Request, key: unknown): DiningAccess | null {
  const token = request.get("X-Table-Access");
  if (!token || token.length > 2048 || typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) return null;
  try {
    const value = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"], issuer, audience });
    if (typeof value === "string" || value.table !== keyHash(key) || !Number.isFinite(value.exp) || !(value.sessionId === null || typeof value.sessionId === "string")) return null;
    return { table: value.table, sessionId: value.sessionId };
  } catch { return null; }
}
export function scannerOriginAllowed(request: Request) {
  const origin = request.get("Origin");
  return !!origin && allowedWebOrigins(env.webUrl, env.webAllowedOrigins, env.nodeEnv !== "production").includes(origin);
}
export const matchesDiningSession = (access: DiningAccess, current: unknown) => access.sessionId === null || access.sessionId === (current ?? null);
