import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { catalogRouter } from "./catalog.routes.js";
import { sequelize } from "../../database/sequelize.js";

test("MySQL: concurrent catalog requests share one query and support ETag", { skip: process.env.RUN_DB_VALIDATION_TESTS !== "true" }, async () => {
  const app = express();
  app.use("/catalog", catalogRouter);
  const server = app.listen(0, "127.0.0.1");
  const listening = once(server, "listening");
  try {
    await sequelize.authenticate();
    await listening;
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/catalog`;
    let queries = 0;
    sequelize.addHook("beforeQuery", "catalog-cache-test", () => { queries++; });
    const responses = await Promise.all([fetch(url), fetch(url), fetch(url)]);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(await response.json()));
      assert.equal(response.headers.get("cache-control"), "no-cache");
    }
    assert.equal(queries, 1);
    const etag = responses[0].headers.get("etag");
    assert.ok(etag);
    // Undici otherwise adds request Cache-Control:no-cache to conditional fetches,
    // deliberately bypassing Express's automatic freshness handling.
    assert.equal((await fetch(url, { headers: { "If-None-Match": etag, "Cache-Control": "max-age=0" } })).status, 304);
    assert.equal(queries, 1);
  } finally {
    sequelize.removeHook("beforeQuery", "catalog-cache-test");
    await new Promise<void>(resolve => server.close(() => resolve()));
    await sequelize.close();
  }
});
