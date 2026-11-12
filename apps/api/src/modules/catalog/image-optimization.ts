import sharp from "sharp";

export const imageWidths = [160, 320, 640, 1200] as const;
export type StoredImage = { data: Buffer; mimeType: string };
let processing = 0;
const waiting: Array<() => void> = [];

export async function optimizeProductImage(data: Buffer, width: number): Promise<StoredImage> {
  if (processing >= 2) {
    if (waiting.length >= 16) throw new Error("Image processing queue is full");
    await new Promise<void>(resolve => waiting.push(resolve));
  } else processing++;
  try {
    const optimized = await sharp(data, { limitInputPixels: 25_000_000 })
      .rotate()
      .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return { data: optimized, mimeType: "image/webp" };
  } finally {
    const next = waiting.shift();
    if (next) next(); else processing--;
  }
}

// Cache variants, not originals. Coalesce simultaneous requests and bound memory.
export function createImageCache(maxBytes = 32 * 1024 * 1024, ttl = 10 * 60_000) {
  const entries = new Map<string, { image: StoredImage; expires: number }>();
  const pending = new Map<string, Promise<StoredImage | null>>();
  let bytes = 0;
  return async (key: string, load: () => Promise<StoredImage | null>) => {
    const cached = entries.get(key);
    if (cached && cached.expires > Date.now()) {
      entries.delete(key); entries.set(key, cached);
      return cached.image;
    }
    if (cached) { entries.delete(key); bytes -= cached.image.data.length; }
    if (pending.has(key)) return pending.get(key)!;
    // A busy server may return an uncached original via the route fallback.
    if (pending.size >= 16) return null;
    const task = Promise.resolve().then(load).then(image => {
      if (image && image.data.length <= maxBytes) {
        while (bytes + image.data.length > maxBytes && entries.size) {
          const oldest = entries.keys().next().value!;
          bytes -= entries.get(oldest)!.image.data.length;
          entries.delete(oldest);
        }
        entries.set(key, { image, expires: Date.now() + ttl });
        bytes += image.data.length;
      }
      return image;
    }).finally(() => { pending.delete(key); });
    pending.set(key, task);
    return task;
  };
}
