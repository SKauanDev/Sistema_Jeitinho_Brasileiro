import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import cors from "cors";
import { allowedWebOrigins } from "./web-origins.js";

test("normaliza a lista de domínios e rejeita curingas, caminhos e credenciais", () => {
  assert.deepEqual(allowedWebOrigins("https://www.jeitinhobrasileiroap.com/", "https://comandacom.vercel.app, https://www.jeitinhobrasileiroap.com"), ["https://www.jeitinhobrasileiroap.com", "https://comandacom.vercel.app"]);
  for (const value of ["*", "https://site.com/path", "https://user:password@site.com", "file:///test", "https://site.com?x=1"]) assert.throws(() => allowedWebOrigins(value));
  assert.ok(allowedWebOrigins("https://site.com", "", true).includes("http://localhost:5173"));
});

test("preflight permite domínio próprio e Vercel e não autoriza uma origem desconhecida", async () => {
  const origins = allowedWebOrigins("https://www.jeitinhobrasileiroap.com", "https://comandacom.vercel.app,https://jeitinhobrasileiroap.com");
  const app = express(); app.use(cors({ origin: origins })); app.post("/auth/login", (_req, res) => res.sendStatus(401));
  const server = app.listen(0, "127.0.0.1");
  try {
    if (!server.listening) await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    for (const origin of [...origins, "https://unknown.example"]) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/auth/login`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
      assert.equal(response.headers.get("access-control-allow-origin"), origins.includes(origin) ? origin : null);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
