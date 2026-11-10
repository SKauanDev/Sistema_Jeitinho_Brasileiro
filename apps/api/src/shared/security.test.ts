import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { createRequireAuth, requireAdmin } from "./auth.middleware.js";
import { createOrderAccess } from "./order-access.middleware.js";
import { apiErrorHandler, createRateLimit, securityHeaders } from "./http-security.js";
import type { SocketIdentity } from "../realtime/socket-security.js";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const sign = (claims: Record<string, unknown>, audience?: string) => jwt.sign(claims, env.jwtSecret, { expiresIn: "1m", ...(audience ? { audience } : {}) });
async function withApp(app: express.Express, run: (base: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test("HTTP: sessão revogada e algoritmo diferente são rejeitados; cliente não vira administrador", async () => {
  const app = express();
  const auth = createRequireAuth(async claims => claims.sub === "inactive" ? null : { role: claims.role, sub: claims.sub, exp: claims.exp } as SocketIdentity);
  app.get("/admin", auth, requireAdmin, (_req,res) => res.json({ok:true}));
  await withApp(app, async base => {
    const request = (token?: string) => fetch(`${base}/admin`, { headers: token ? { Authorization:`Bearer ${token}` } : {} });
    assert.equal((await request()).status,401);
    assert.equal((await request(sign({role:"ADMIN",sub:"inactive"}))).status,401);
    assert.equal((await request(sign({role:"CUSTOMER",sub:"customer"}))).status,403);
    assert.equal((await request(sign({role:"ADMIN",sub:"admin"}))).status,200);
    assert.equal((await request(jwt.sign({role:"ADMIN",sub:"admin"},env.jwtSecret,{algorithm:"HS384",expiresIn:"1m"}))).status,401);
    assert.equal((await request(jwt.sign({role:"ADMIN",sub:"admin"},env.jwtSecret,{expiresIn:-1}))).status,401);
  });
});

test("HTTP: só proprietário, administrador ou capacidade assinada acessam um pedido", async () => {
  const app = express();
  let ownerReads = 0;
  const middleware = createOrderAccess(async claims => {
    if (claims.role === "ORDER_TRACKING" && claims.aud !== "urfood-order-tracking") return null;
    return {role:claims.role,sub:claims.sub,orderId:claims.orderId,exp:claims.exp} as SocketIdentity;
  }, async () => { ownerReads++; return "owner-account"; });
  app.get("/orders/:id",middleware,(_req,res)=>res.json({ok:true}));
  await withApp(app, async base => {
    const request = (headers: Record<string,string> = {}) => fetch(`${base}/orders/${id}`,{headers});
    assert.equal((await request()).status,401);
    assert.equal(ownerReads,0);
    assert.equal((await request({Authorization:`Bearer ${sign({role:"CUSTOMER",sub:"other-account"})}`})).status,403);
    assert.equal((await request({Authorization:`Bearer ${sign({role:"CUSTOMER",sub:"owner-account"})}`})).status,200);
    assert.equal((await request({"X-Order-Token":sign({role:"ORDER_TRACKING",orderId:otherId},"urfood-order-tracking")})).status,403);
    assert.equal((await request({"X-Order-Token":sign({role:"ORDER_TRACKING",orderId:id},"wrong-audience")})).status,403);
    const token = sign({role:"ORDER_TRACKING",orderId:id},"urfood-order-tracking");
    const valid = await request({Authorization:"Bearer expired-session","X-Order-Token":token});
    assert.equal(valid.status,200); assert.equal(valid.headers.get("cache-control"),"private, no-store");
  });
});

test("HTTP: limita tentativas, restabelece a janela e não retorna stack em JSON inválido", async () => {
  const app = express(); let time = 0;
  app.use(securityHeaders);
  app.post("/login", createRateLimit(2,1000,()=>time), (_req,res)=>res.sendStatus(204));
  app.use(express.json());
  app.post("/body",(_req,res)=>res.sendStatus(204));
  app.use(apiErrorHandler);
  await withApp(app,async base=>{
    for(let i=0;i<2;i++) assert.equal((await fetch(`${base}/login`,{method:"POST"})).status,204);
    const limited = await fetch(`${base}/login`,{method:"POST"});
    assert.equal(limited.status,429); assert.equal(limited.headers.get("retry-after"),"1");
    time = 1001; assert.equal((await fetch(`${base}/login`,{method:"POST"})).status,204);
    const invalid = await fetch(`${base}/body`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{"});
    assert.equal(invalid.status,400); assert.equal(invalid.headers.get("x-content-type-options"),"nosniff");
    assert.deepEqual(Object.keys(await invalid.json()),["message"]);
  });
});
