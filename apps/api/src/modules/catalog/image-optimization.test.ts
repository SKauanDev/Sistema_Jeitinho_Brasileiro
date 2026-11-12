import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createImageCache, optimizeProductImage } from "./image-optimization.js";

test("image variants preserve proportions, transparency and orientation without enlarging", async () => {
  const original = await sharp({ create: { width: 1600, height: 800, channels: 4, background: { r: 180, g: 30, b: 10, alpha: 0.5 } } }).png().toBuffer();
  const small = await optimizeProductImage(original, 320);
  const metadata = await sharp(small.data).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 320); assert.equal(metadata.height, 160);
  assert.equal(metadata.hasAlpha, true); assert.equal(small.mimeType, "image/webp");
  assert.ok(small.data.length < original.length);
  const tiny = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).jpeg().toBuffer();
  assert.equal((await sharp((await optimizeProductImage(tiny, 320)).data).metadata()).width, 20);
  const rotated = await sharp(tiny).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const upright = await sharp((await optimizeProductImage(rotated, 320)).data).metadata();
  assert.equal(upright.width, 10); assert.equal(upright.height, 20);
  await assert.rejects(optimizeProductImage(Buffer.from("not an image"), 320));
});

test("image cache shares concurrent loads, evicts to its byte limit and retries failures", async () => {
  const get = createImageCache(10);
  let calls = 0;
  const load = async () => { calls++; return { data: Buffer.alloc(6), mimeType: "image/webp" }; };
  await Promise.all([get("a", load), get("a", load), get("a", load)]);
  assert.equal(calls, 1);
  await get("a", load); assert.equal(calls, 1);
  await get("b", load); await get("a", load); assert.equal(calls, 3);
  await assert.rejects(get("failed", async () => { throw Error("temporary failure"); }));
  await get("failed", load); assert.equal(calls, 4);
  await get("missing", async () => null);
  assert.ok(await get("missing", load));
  const expired = createImageCache(10, -1);
  await expired("a", load); await expired("a", load); assert.equal(calls, 7);
});
