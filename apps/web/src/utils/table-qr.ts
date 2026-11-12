const restaurantOrigins = ["https://www.jeitinhobrasileiroap.com", "https://jeitinhobrasileiroap.com", "https://comandacom.vercel.app"];

/** QR contents are untrusted: navigate only to a local table route, never an arbitrary URL. */
export function tablePathFromQr(value: string, origin: string): string | null {
  try {
    const url = new URL(value.trim(), origin);
    if (![origin, ...restaurantOrigins].includes(url.origin) || !["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    const match = /^\/mesa\/([a-f0-9]{64})\/?$/i.exec(url.pathname);
    return match ? `/mesa/${match[1]!.toLowerCase()}` : null;
  } catch { return null; }
}
