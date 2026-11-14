import { hash } from "bcryptjs";
import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import {
  CustomerAccount,
  CustomerRecord,
  User,
  Order,
  OrderItem,
  OrderItemOption,
  OrderStatusHistory,
  Category,
  Product,
  StoreSetting,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";
import { customerRouter, publicCustomerRouter } from "./customer.routes.js";
import { customerProfile, listCustomers } from "./customer-history.service.js";
import { createOrderRouter } from "../orders/order.routes.js";

test(
  "MySQL: histórico administrativo reúne conta, convidado, aliases e +55; endereço vazio usa a entrega; sessão não recebe pedidos de terceiros",
  {
    skip: process.env.RUN_DB_CUSTOMER_HISTORY_TESTS !== "true",
    timeout: 60000,
  },
  async () => {
    const suffix = String(Date.now()).slice(-8),
      phone = `319${suffix}`,
      alias = `219${suffix}`,
      otherPhone = `119${suffix}`,
      differentPhone = `419${suffix}`;
    const recordId = randomUUID(), adminId = randomUUID(),
      accountId = randomUUID(),
      otherAccountId = randomUUID(),
      categoryId = randomUUID(),
      productId = randomUUID(),
      ids: string[] = [];
    const app = express();
    app.use(express.json());
    app.use("/admin/customers", customerRouter); app.use("/customers", publicCustomerRouter);
    const settings = StoreSetting.build({
      allowPickup: true,
      allowDelivery: false,
      cashEnabled: true,
      minimumOrder: 0,
      pizzaRules: null,
    });
    app.use(
      "/orders",
      createOrderRouter({
        settings: async () => settings,
        isOpen: async () => true,
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`,
      admin = jwt.sign({ sub: adminId, role: "ADMIN" }, env.jwtSecret, {
        expiresIn: "3m",
      }),
      customer = jwt.sign({ sub: accountId, role: "CUSTOMER" }, env.jwtSecret, {
        expiresIn: "3m",
      });
    const create = async (changes: Record<string, unknown>) => {
      const row = await Order.create({
        customerName: "Kauan QA histórico",
        customerPhone: phone,
        fulfillmentType: "DELIVERY",
        status: "COMPLETED",
        paymentMethod: "CASH",
        paymentStatus: "NOT_REQUIRED",
        subtotal: 50,
        total: 50,
        street: "Rua entrega QA",
        number: "144",
        neighborhood: "Bairro QA",
        city: "Cidade QA",
        state: "MG",
        postalCode: "36000000",
        createdAt: new Date("2026-11-10T18:00:00Z"),
        ...changes,
      });
      ids.push(String(row.getDataValue("id")));
      return row;
    };
    try {
      await User.create({
        id: adminId,
        name: "QA histórico",
        username: adminId,
        email: `${adminId}@example.invalid`,
        passwordHash: "QA-only",
        role: "ADMIN",
        active: true,
      });
      await CustomerAccount.bulkCreate([
        {
          id: accountId,
          phone: `55${phone}`,
          passwordHash: await hash("history-qa-password",4),
          active: true,
        },
        {
          id: otherAccountId,
          phone: otherPhone,
          passwordHash: "QA-only",
          active: true,
        },
      ]);
      await CustomerRecord.create({
        id: recordId,
        originalPhone: phone,
        phone,
        aliases: [phone, alias],
        name: "Kauan QA histórico",
        address: { street: "", city: "", state: "", postalCode: "" },
      });
      const canceled = await create({
        customerAccountId: accountId,
        status: "CANCELED",
        street: "Rua cancelada QA",
        createdAt: new Date("2026-11-14T18:00:00Z"),
      });
      const completed = await create({
        customerPhone: `\u200e+55 (${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`,
        customerAccountId: null,
      });
      await create({
        customerPhone: alias,
        total: 30,
        subtotal: 30,
        createdAt: new Date("2026-11-09T18:00:00Z"),
      });
      const linked = await create({
        customerPhone: differentPhone,
        customerAccountId: accountId,
        fulfillmentType: "PICKUP",
        street: null,
        total: 20,
        subtotal: 20,
      });
      await create({
        customerPhone: otherPhone,
        customerAccountId: otherAccountId,
        total: 999,
        subtotal: 999,
      });
      const profile = await customerProfile(`55${phone}`);
      assert.ok(profile);
      assert.equal(profile.ordersCount, 4);
      assert.equal(profile.completedOrders, 3);
      assert.equal(profile.totalSpent, 100);
      assert.equal(profile.address?.street, "Rua entrega QA");
      assert.equal(profile.address?.number, "144");
      assert.ok(
        profile.orders.some(
          (row) => row.getDataValue("id") === completed.getDataValue("id"),
        ),
      );
      assert.ok(
        profile.orders.some(
          (row) => row.getDataValue("id") === canceled.getDataValue("id"),
        ),
      );
      const listing = await listCustomers(),
        entry = listing.find((row) => row.id === phone);
      assert.ok(entry);
      assert.equal(entry.ordersCount, profile.ordersCount);
      assert.equal(entry.totalSpent, profile.totalSpent);
      assert.equal(
        listing.filter((row) =>
          [phone, `55${phone}`, alias, differentPhone].includes(row.id),
        ).length,
        1,
      );
      const login=await fetch(`${base}/customers/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone,password:"history-qa-password"})});
    assert.equal(login.status,200,await login.clone().text());assert.equal((await login.json()).customer.ordersCount,2);
    const privateProfile = await customerProfile(phone, accountId);
      assert.ok(privateProfile);
      assert.equal(privateProfile.ordersCount, 2);
      assert.ok(
        privateProfile.orders.every(
          (row) => row.getDataValue("customerAccountId") === accountId,
        ),
      );
      const response = await fetch(
        `${base}/admin/customers/${encodeURIComponent(`+55 ${phone}`)}`,
        { headers: { Authorization: `Bearer ${admin}` } },
      );
      assert.equal(response.status, 200);
      const details = await response.json();
      assert.equal(details.orders.length, 4);
      assert.equal(details.address.street, "Rua entrega QA");
      await Category.create({
        id: categoryId,
        name: "QA histórico bebida",
        slug: categoryId,
      });
      await Product.create({
        id: productId,
        categoryId,
        name: "QA vínculo",
        price: 10,
        active: true,
      });
      const body = {
        customerName: "QA vínculo",
        customerPhone: `(${phone.slice(0, 2)}) ${phone.slice(2)}`,
        fulfillmentType: "PICKUP",
        paymentMethod: "CASH",
        items: [{ productId, quantity: 1 }],
      };
      const placed = await fetch(`${base}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer}`,
        },
        body: JSON.stringify(body),
      });
      assert.equal(placed.status, 201, await placed.clone().text());
      const placedId = (await placed.json()).id;
      ids.push(placedId);
      assert.equal(
        (await Order.findByPk(placedId))?.getDataValue("customerAccountId"),
        accountId,
      );
      const denied = await fetch(`${base}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer}`,
        },
        body: JSON.stringify({ ...body, customerPhone: otherPhone }),
      });
      assert.equal(denied.status, 401);
      const updated = await fetch(`${base}/admin/customers/${phone}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${admin}`,
        },
        body: JSON.stringify({
          name: "Kauan QA histórico",
          phone,
          email: "",
          address: { street: "Rua cadastro QA" },
        }),
      });
      assert.equal(updated.status, 200, await updated.clone().text());
      const saved = await updated.json();
      assert.equal(saved.address.street, "Rua cadastro QA");
      assert.equal(saved.address.number, "144");
      await completed.reload();
      assert.equal(completed.getDataValue("street"), "Rua entrega QA");
      assert.equal(linked.getDataValue("customerAccountId"), accountId);
    } finally {
      for (const orderId of ids) {
        const items = await OrderItem.findAll({ where: { orderId } });
        await OrderItemOption.destroy({
          where: {
            orderItemId: {
              [Op.in]: items.map((item) => item.getDataValue("id")),
            },
          },
        });
        await OrderItem.destroy({ where: { orderId } });
        await OrderStatusHistory.destroy({ where: { orderId } });
        await Order.destroy({ where: { id: orderId } });
      }
      await CustomerRecord.destroy({ where: { id: recordId } });
      await CustomerAccount.destroy({
        where: { id: { [Op.in]: [accountId, otherAccountId] } },
      });
      await Product.destroy({ where: { id: productId } });
      await Category.destroy({ where: { id: categoryId } });
      await User.destroy({ where: { id: adminId } });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await sequelize.close();
    }
  },
);
