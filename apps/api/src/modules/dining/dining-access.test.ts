import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { issueDiningAccess, matchesDiningSession, readDiningAccess, scannerOriginAllowed } from "./dining-access.js";

const key = "a".repeat(64);
const request = (token?: string, origin?: string) => ({ get: (name: string) => name === "Origin" ? origin : token }) as Request;
test("table access rejects direct requests, wrong table, forged/expired tokens and login tokens", () => {
  assert.equal(readDiningAccess(request(), key), null);
  const token = issueDiningAccess(key, "session-a");
  assert.equal(readDiningAccess(request(token), key)?.sessionId, "session-a");
  assert.equal(readDiningAccess(request(token), "b".repeat(64)), null);
  assert.equal(readDiningAccess(request(token + "x"), key), null);
  assert.equal(readDiningAccess(request(jwt.sign({ sub: "admin", role: "ADMIN" }, env.jwtSecret)), key), null);
  const decoded = jwt.decode(token) as jwt.JwtPayload;
  delete decoded.exp; delete decoded.iat;
  assert.equal(readDiningAccess(request(jwt.sign(decoded, env.jwtSecret, { expiresIn: -1 })), key), null);
  assert.equal(readDiningAccess(request(jwt.sign(decoded, env.jwtSecret)), key), null);
  assert.equal(matchesDiningSession(readDiningAccess(request(token), key)!, "session-b"), false);
  assert.equal(matchesDiningSession(readDiningAccess(request(token), key)!, null), false);
  assert.equal(matchesDiningSession(readDiningAccess(request(issueDiningAccess(key, null)), key)!, null), true);
});
test("scanner authorization rejects absent and external origins", () => {
  assert.equal(scannerOriginAllowed(request()), false);
  assert.equal(scannerOriginAllowed(request(undefined, "https://external.invalid")), false);
  assert.equal(scannerOriginAllowed(request(undefined, new URL(env.webUrl).origin)), true);
});
