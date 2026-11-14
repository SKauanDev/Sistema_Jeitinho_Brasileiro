import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import { Op } from "sequelize";
import {
  Category,
  Product,
  Order,
  OrderItem,
  OrderItemOption,
  OrderStatusHistory,
  StoreSetting,
} from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { createOrderRouter } from "../orders/order.routes.js";

test(
  "MySQL: preço automático QUA/QUI/SEX é recalculado no servidor; todo pedido entra em Novos mesmo com aceite antigo ativo",
  {
    skip: process.env.RUN_DB_PRODUCT_PROMOTION_TESTS !== "true",
    timeout: 60000,
  },
  async () => {
    const categoryId = randomUUID(),
      productId = randomUUID(),
      orders: string[] = [];
    let clock = new Date("2026-11-11T18:00:00Z");
    const settings = StoreSetting.build({
      autoAcceptOrders: true,
      allowPickup: true,
      allowDelivery: false,
      isOpen: true,
      minimumOrder: 0,
      cashEnabled: true,
      pizzaRules: null,
    });
    const app = express();
    app.use(express.json());
    app.use(
      "/orders",
      createOrderRouter({
        settings: async () => settings,
        isOpen: async () => true,
        pricingNow: () => clock,
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
      await Category.create({
        id: categoryId,
        name: "Sanduíches QA agenda",
        slug: categoryId,
      });
      await Product.create({
        id: productId,
        categoryId,
        name: "QA promoção",
        price: 100,
        promotionDays: [3, 4, 5],
        promotionDiscountPercent: 20,
        active: true,
      });
      for (const [date, price] of [
        ["2026-11-11T18:00:00Z", 80],
        ["2026-11-12T18:00:00Z", 80],
        ["2026-11-13T18:00:00Z", 80],
        ["2026-11-14T18:00:00Z", 100],
      ] as const) {
        clock = new Date(date);
        const response: Response = await fetch(
          `http://127.0.0.1:${address.port}/orders`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerName: "QA agenda",
              customerPhone: "32900000000",
              fulfillmentType: "PICKUP",
              paymentMethod: "CASH",
              items: [{ productId, quantity: 1, unitPrice: 1 }],
            }),
          },
        );
        assert.equal(response.status, 201, await response.clone().text());
        const id = ((await response.json()) as {id: string}).id;
        orders.push(id);
        const order = await Order.findByPk(id);
        assert.equal(order?.getDataValue("status"), "NEW");
        assert.equal(Number(order?.getDataValue("subtotal")), price);
        assert.equal(
          Number(
            (await OrderItem.findOne({ where: { orderId: id } }))?.getDataValue(
              "unitPrice",
            ),
          ),
          price,
        );
      }
    } finally {
      for (const orderId of orders) {
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
      await Product.destroy({ where: { id: productId } });
      await Category.destroy({ where: { id: categoryId } });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await sequelize.close();
    }
  },
);
