import type { CSSProperties } from "react";

// A single local photograph sheet keeps all six menu images available offline.
export function FoodImage({ src, alt, className = "", sizes = "96px", priority = false }: { src: string; alt: string; className?: string; sizes?: string; priority?: boolean }) {
  const match = /#pizza=(\d)/.exec(src);
  const loading = priority ? "eager" : "lazy";
  if (!match) {
    const databaseImage = /\/catalog\/images\/[0-9a-f-]{36}$/i.test(src);
    const variant = (width: number) => `${src}?w=${width}&v=1`;
    return <img src={databaseImage ? variant(320) : src} srcSet={databaseImage ? [160, 320, 640, 1200].map(width => `${variant(width)} ${width}w`).join(", ") : undefined} sizes={databaseImage ? sizes : undefined} alt={alt} className={className} loading={loading} decoding="async" fetchPriority={priority ? "high" : undefined} />;
  }
  const index = Number(match[1]);
  return <div role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={!alt || undefined} className={`food-image ${className}`} style={{ "--food-column": index % 3, "--food-row": Math.floor(index / 3) } as CSSProperties}>
    <img src={src.split("#")[0]} alt="" draggable={false} loading={loading} decoding="async" />
  </div>;
}
