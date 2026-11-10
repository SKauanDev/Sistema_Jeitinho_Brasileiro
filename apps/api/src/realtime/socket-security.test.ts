import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { io as client, type Socket } from "socket.io-client";
import { configureSocketSecurity, ADMIN_ROOM, orderTrackingToken } from "./socket-security.js";
import { env } from "../config/env.js";
import { User, CustomerAccount, Order } from "../database/models.js";
import { sequelize } from "../database/sequelize.js";

test("Socket.IO: autenticação, isolamento de salas e autorização por pedido", { skip: process.env.RUN_DB_VALIDATION_TESTS !== "true", timeout: 15000 }, async () => {
  const httpServer = http.createServer();
  const server = new Server(httpServer);
  configureSocketSecurity(server);
  const sockets: Socket[] = [];
  httpServer.listen(0, "127.0.0.1"); await once(httpServer, "listening");
  const address = httpServer.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  function connect(token?: string) { const socket = client(url, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: 2000 }); sockets.push(socket); return socket; }
  function socketEvent(socket: Socket, event: string) { return new Promise<unknown[]>(resolve => socket.once(event, (...args: unknown[]) => resolve(args))); }
  async function rejected(token?: string) { const socket = connect(token); await socketEvent(socket, "connect_error"); assert.equal(socket.connected, false); socket.disconnect(); }
  async function watch(socket: Socket, id: string) { return await socket.timeout(2000).emitWithAck("watch:order", id) as { ok: boolean }; }
  try {
    await rejected(); await rejected("invalid");
    await rejected(jwt.sign({ role: "ADMIN", sub: randomUUID() }, env.jwtSecret, { expiresIn: "1m" }));
    await rejected(jwt.sign({ role: "ADMIN", sub: randomUUID() }, env.jwtSecret, { expiresIn: -1 }));
    await rejected(jwt.sign({ role: "OTHER" }, env.jwtSecret, { expiresIn: "1m" }));
    const ownId = randomUUID(); const otherId = randomUUID();
    const tracking = connect(orderTrackingToken(ownId)); await socketEvent(tracking, "connect");
    assert.equal((await watch(tracking, ownId)).ok, true);
    assert.equal((await watch(tracking, otherId)).ok, false);
    assert.equal((await watch(tracking, ADMIN_ROOM)).ok, false);
    const leaked: unknown[] = []; tracking.on("order:new", event => leaked.push(event)); tracking.on("order:status", event => leaked.push(event));
    const adminAccount = await User.findOne({ where: { role: "ADMIN", active: true }, attributes: ["id"] }); assert.ok(adminAccount);
    await rejected(jwt.sign({ role: "OPERATOR", sub: String(adminAccount.getDataValue("id")) }, env.jwtSecret, { expiresIn: "1m" }));
    await rejected(jwt.sign({ role: "ORDER_TRACKING", orderId: ownId }, env.jwtSecret, { expiresIn: "1m", audience: "invalid-audience" }));
    const adminToken = jwt.sign({ role: "ADMIN", sub: String(adminAccount.getDataValue("id")) }, env.jwtSecret, { expiresIn: "1m" });
    const admin = connect(adminToken); await socketEvent(admin, "connect");
    const notification = socketEvent(admin, "order:new");
    server.to(ADMIN_ROOM).emit("order:new", { id: otherId }); await notification;
    server.to(`order:${otherId}`).emit("order:status", { id: otherId });
    const update = socketEvent(tracking, "order:payment"); server.to(`order:${ownId}`).emit("order:payment", { id: ownId });
    await update; assert.deepEqual(leaked, []);
    const customer = await CustomerAccount.findOne({ where: { active: true } });
    if (customer) {
      const customerSocket = connect(jwt.sign({ role: "CUSTOMER", sub: String(customer.getDataValue("id")) }, env.jwtSecret, { expiresIn: "1m" })); await socketEvent(customerSocket, "connect");
      const phone = String(customer.getDataValue("phone"));
      const orders = await Order.findAll({ attributes: ["id", "customerPhone"] });
      const own = orders.find(order => String(order.getDataValue("customerPhone")).replace(/\D/g, "") === phone);
      const other = orders.find(order => String(order.getDataValue("customerPhone")).replace(/\D/g, "") !== phone);
      if (own) assert.equal((await watch(customerSocket, String(own.getDataValue("id")))).ok, true);
      if (other) assert.equal((await watch(customerSocket, String(other.getDataValue("id")))).ok, false);
      assert.equal((await watch(customerSocket, ADMIN_ROOM)).ok, false);
    }
    // O limite também restringe tentativas negadas, evitando consultas ilimitadas.
    for (let attempt = 0; attempt < 61; attempt++) await watch(tracking, otherId);
    assert.equal((await watch(tracking, ownId)).ok, false);
    const shortLived = connect(jwt.sign({ role: "ORDER_TRACKING", orderId: ownId }, env.jwtSecret, { expiresIn: "2s", audience: "urfood-order-tracking" }));
    await socketEvent(shortLived, "connect");
    await socketEvent(shortLived, "disconnect");
    assert.equal(shortLived.connected, false);
  } finally {
    sockets.forEach(socket => socket.disconnect());
    await new Promise<void>(resolve => server.close(() => resolve()));
    await sequelize.close();
  }
});
