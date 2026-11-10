/** Bounded single-value cache; invalidation also discards an older in-flight load. */
export function createAsyncCache<T>(ttlMs: number, load: () => Promise<T>) {
  let generation = 0;
  let cached: { value: T; until: number } | undefined;
  let pending: Promise<T> | undefined;
  return {
    invalidate() { generation++; cached = undefined; pending = undefined; },
    get(): Promise<T> {
      if (cached && cached.until > Date.now()) return Promise.resolve(cached.value);
      if (pending) return pending;
      const version = generation;
      const task = Promise.resolve().then(load).then(value => {
        if (generation === version) cached = { value, until: Date.now() + ttlMs };
        return value;
      }).finally(() => { if (pending === task) pending = undefined; });
      pending = task;
      return task;
    },
  };
}
