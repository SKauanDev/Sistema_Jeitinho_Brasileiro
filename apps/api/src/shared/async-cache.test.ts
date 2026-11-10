import assert from "node:assert/strict";
import { test } from "node:test";
import { createAsyncCache } from "./async-cache.js";

test("concurrent requests share a load; invalidation and TTL reload", async () => {
  let count = 0;
  const cache = createAsyncCache(60_000, async () => ++count);
  assert.deepEqual(await Promise.all([cache.get(), cache.get(), cache.get()]), [1, 1, 1]);
  assert.equal(await cache.get(), 1);
  cache.invalidate();
  assert.equal(await cache.get(), 2);
  const uncached = createAsyncCache(0, async () => ++count);
  assert.equal(await uncached.get(), 3);
  assert.equal(await uncached.get(), 4);
});

test("an invalidated in-flight load cannot overwrite the new cached value", async () => {
  let resolve!: (value: number) => void;
  let count = 0;
  const cache = createAsyncCache(60_000, () => ++count === 1 ? new Promise<number>(done => { resolve = done; }) : Promise.resolve(2));
  const old = cache.get();
  await Promise.resolve();
  cache.invalidate();
  assert.equal(await cache.get(), 2);
  resolve(1);
  assert.equal(await old, 1);
  assert.equal(await cache.get(), 2);
});

test("failed loads do not poison the cache", async () => {
  let count = 0;
  const cache = createAsyncCache(60_000, async () => { if (++count === 1) throw new Error("offline"); return 2; });
  await assert.rejects(cache.get(), /offline/);
  assert.equal(await cache.get(), 2);
});
