import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { CustomerAccount, Order } from "../database/models.js";
import { sequelize } from "../database/sequelize.js";
import { orderRouter } from "../modules/orders/order.routes.js";
import { publicCustomerRouter } from "../modules/customers/customer.routes.js";
import { orderTrackingToken } from "../realtime/socket-security.js";

test("MySQL: cadastro prova posse de um pedido; conhecer telefone não libera histórico alheio", { skip: process.env.RUN_DB_SECURITY_TESTS !== "true" }, async () => {
  const ids: [string,string] = [randomUUID(),randomUUID()];
  const customerPhone = `329${String(Date.now()).slice(-8)}`;
  let accountId: string | undefined;
  const app = express(); app.use(express.json()); app.use("/orders",orderRouter); app.use("/customers",publicCustomerRouter);
  const server = app.listen(0,"127.0.0.1");
  try {
    await sequelize.authenticate();
    for (const id of ids) await Order.create({ id,customerName:"Security test fixture",customerPhone,fulfillmentType:"PICKUP",paymentMethod:"CASH",paymentStatus:"NOT_REQUIRED",subtotal:1,total:1,status:"COMPLETED" });
    if (!server.listening) await new Promise<void>(resolve=>server.once("listening",resolve));
    const address = server.address(); assert.ok(address && typeof address!=="string");
    const base = `http://127.0.0.1:${address.port}`;
    const password = "Temporary-only-security-test";
    const register = (proof = {}) => fetch(`${base}/customers/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:customerPhone,password,...proof})});
    assert.equal((await register()).status,403);
    assert.equal((await fetch(`${base}/orders/${ids[0]}`)).status,401);
    const registered = await register({orderId:ids[0],orderToken:orderTrackingToken(ids[0])});
    assert.equal(registered.status,201);
    const session = await registered.json() as {token:string;customer:{orders:Array<{id:string}>}};
    const claims = jwt.verify(session.token,env.jwtSecret) as jwt.JwtPayload;
    accountId = claims.sub!;
    assert.deepEqual(session.customer.orders.map(order=>order.id),[ids[0]]);
    const headers = {Authorization:`Bearer ${session.token}`};
    assert.equal((await fetch(`${base}/orders/${ids[0]}`,{headers})).status,200);
    assert.equal((await fetch(`${base}/orders/${ids[1]}`,{headers})).status,403);
    assert.equal((await fetch(`${base}/orders/${ids[1]}`,{headers:{"X-Order-Token":orderTrackingToken(ids[1])}})).status,200);
    const profile = await (await fetch(`${base}/customers/session`,{headers})).json() as {orders:Array<{id:string}>};
    assert.deepEqual(profile.orders.map(order=>order.id),[ids[0]]);
    await CustomerAccount.update({active:false},{where:{id:accountId}});
    assert.equal((await fetch(`${base}/customers/session`,{headers})).status,401);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await Order.destroy({where:{id:ids}});
    if (accountId) await CustomerAccount.destroy({where:{id:accountId}});
    await sequelize.close();
  }
});
