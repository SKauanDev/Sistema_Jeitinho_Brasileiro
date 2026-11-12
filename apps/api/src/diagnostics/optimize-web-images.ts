import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { stat } from "node:fs/promises";

const images = new URL("../../../web/public/images/", import.meta.url);
for (const [source, target, width, quality] of [
  ["pizza-hero.png", "pizza-hero.webp", 1280, 82],
  ["pizza-hero.png", "pizza-hero-mobile.webp", 640, 80],
  ["logo.png", "logo.webp", 512, 85],
] as const) {
  const input = fileURLToPath(new URL(source, images));
  const output = fileURLToPath(new URL(target, images));
  await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(output);
  const [before, after] = await Promise.all([stat(input), stat(output)]);
  console.log(`${target}: ${before.size} → ${after.size} bytes (${Math.round((1 - after.size / before.size) * 100)}% menor)`);
}
