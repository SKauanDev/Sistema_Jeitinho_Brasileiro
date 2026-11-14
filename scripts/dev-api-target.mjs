import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Same precedence as the API when launched through its npm workspace.
export function devApiTarget() {
  const settings = {};
  config({
    path: [new URL("../apps/api/.env", import.meta.url), new URL("../.env", import.meta.url)].map(url => fileURLToPath(url)),
    processEnv: settings,
    quiet: true,
  });
  const port = Number(process.env.PORT ?? settings.PORT ?? 3333);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT invalida para a API local.");
  const host = (process.env.HOST ?? settings.HOST ?? "0.0.0.0").trim();
  const address = !host || host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  return `http://${address.includes(":") ? `[${address}]` : address}:${port}`;
}
