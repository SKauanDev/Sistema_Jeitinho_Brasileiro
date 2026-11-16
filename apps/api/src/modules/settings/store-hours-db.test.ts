import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import { StoreHour, StoreSetting, User } from "../../database/models.js";
import { sequelize } from "../../database/sequelize.js";
import { env } from "../../config/env.js";
import { createSettingsRouter } from "./settings.routes.js";
import { effectiveStoreStatus } from "./store-operation.service.js";

test(
  "MySQL/HTTP: reabre dia fechado, persiste alterações e não aceita horários vazios",
  { skip: process.env.RUN_DB_HOURS_TESTS !== "true", timeout: 60000 },
  async () => {
    const id = randomUUID();
    const setting = await StoreSetting.create({
      id,
      storeName: "QA horários",
      isOpen: true,
      averagePreparationMinutes: 30,
    });
    const app = express();
    app.use(express.json());
    app.use(createSettingsRouter(async () => setting));
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
      const admin = await User.findOne({
        where: { role: "ADMIN", active: true },
      });
      assert.ok(admin);
      const token = jwt.sign(
        { sub: admin.getDataValue("id"), role: "ADMIN" },
        env.jwtSecret,
        { expiresIn: "3m" },
      );
      const send = (hours: unknown) =>
        fetch(`http://127.0.0.1:${address.port}/hours`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ hours }),
        });
      const days = Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        isClosed: true,
        opensAt: null as string | null,
        closesAt: null as string | null,
      }));
      assert.equal((await send(days)).status, 200);
      assert.equal(await effectiveStoreStatus(setting), false);
      days.forEach((day) => {
        day.isClosed = false;
        day.opensAt = "00:00";
        day.closesAt = "00:00";
      });
      const reopened = await send(days);
      assert.equal(reopened.status, 200);
      assert.equal(
        (await reopened.json()).every(
          (day: any) => !day.isClosed && day.opensAt.startsWith("00:00"),
        ),
        true,
      );
      assert.equal(await effectiveStoreStatus(setting), true);
      const broken = days.map((day) => ({ ...day, opensAt: null }));
      assert.equal((await send(broken)).status, 400);
      assert.equal((await send(days.map(() => days[0]))).status, 400);
      assert.equal(await StoreHour.count({ where: { storeSettingId: id } }), 7);
      assert.equal(await effectiveStoreStatus(setting), true);
      days.forEach((day) => {
        day.opensAt = "18:45";
        day.closesAt = "02:15";
      });
      const updated = await send(days);
      assert.equal(updated.status, 200);
      assert.equal(
        (await updated.json()).every(
          (day: any) =>
            day.opensAt.startsWith("18:45") && day.closesAt.startsWith("02:15"),
        ),
        true,
      );
      await setting.update({ isOpen: false });
      assert.equal(await effectiveStoreStatus(setting), false);
    } finally {
      await StoreHour.destroy({ where: { storeSettingId: id } });
      await setting.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await sequelize.close();
    }
  },
);
