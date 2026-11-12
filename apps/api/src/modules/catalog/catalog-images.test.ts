import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { get } from "node:http";
import express from "express";
import sharp from "sharp";
import { ProductImage } from "../../database/models.js";
import { catalogRouter } from "./catalog.routes.js";

test("catalog serves responsive variants, cached ETags, originals and missing image responses", async () => {
  const original = await sharp({ create: { width: 1000, height: 500, channels: 3, background: "orange" } }).png().toBuffer();
  const id = "00000000-0000-4000-8000-000000000001";
  const originalFind = ProductImage.findByPk;
  let reads = 0;
  ProductImage.findByPk = (async (key: string) => {
    reads++;
    return key === id ? ProductImage.build({ id, data: original, size: original.length, mimeType: "image/png" }) : null;
  }) as typeof originalFind;
  const app = express(); app.use("/catalog", catalogRouter);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/catalog/images/`;
  try {
    const response = await fetch(`${base}${id}?w=320&v=1`);
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type")!, /image\/webp/);
    assert.match(response.headers.get("cache-control")!, /immutable/);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal((await sharp(data).metadata()).width, 320);
    const etag = response.headers.get("etag"); assert.ok(etag);
    const cachedStatus = await new Promise<number | undefined>((resolve, reject) => {
      get(`${base}${id}?w=320&v=1`, { headers: { "If-None-Match": etag } }, result => {
        result.resume(); result.on("end", () => resolve(result.statusCode));
      }).on("error", reject);
    });
    assert.equal(cachedStatus, 304);
    assert.equal(reads, 1);
    const raw = await fetch(base + id);
    assert.deepEqual(Buffer.from(await raw.arrayBuffer()), original);
    assert.equal((await fetch(`${base}${id}?w=99999`)).status, 400);
    assert.equal((await fetch(base + "invalid")).status, 404);
    assert.equal((await fetch(base + "00000000-0000-4000-8000-000000000002?w=160")).status, 404);
  } finally {
    ProductImage.findByPk = originalFind;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
