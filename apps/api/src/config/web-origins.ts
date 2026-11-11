export function allowedWebOrigins(primary: string, additional = "", development = false): string[] {
  const values = [primary, ...additional.split(","), ...(development ? ["http://localhost:5173", "http://127.0.0.1:5173"] : [])];
  return [...new Set(values.map(value => value.trim()).filter(Boolean).map(value => {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("Configure WEB_URL e WEB_ALLOWED_ORIGINS com origens HTTP/HTTPS, sem caminhos.");
    }
    return url.origin;
  }))];
}
