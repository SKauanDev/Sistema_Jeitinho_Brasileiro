import type { CSSProperties } from "react";

// A single local photograph sheet keeps all six menu images available offline.
export function FoodImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const match = /#pizza=(\d)/.exec(src);
  if (!match) return <img src={src} alt={alt} className={className} />;
  const index = Number(match[1]);
  return <div role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={!alt || undefined} className={`food-image ${className}`} style={{ "--food-column": index % 3, "--food-row": Math.floor(index / 3) } as CSSProperties}>
    <img src={src.split("#")[0]} alt="" draggable={false} />
  </div>;
}
