import { setTimeout } from "node:timers/promises";
import { devApiTarget } from "./dev-api-target.mjs";

const target = devApiTarget();
const deadline = Date.now() + 90_000;
console.log(`Aguardando a API em ${target}/health antes de iniciar o frontend...`);
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${target}/health`, { signal: AbortSignal.timeout(1500), redirect: "error" });
    if (response.ok && (await response.json()).status === "ok") { ready = true; break; }
  } catch { /* The API may still be connecting to the database. */ }
  await setTimeout(500);
}
if (!ready) {
  console.error("A API nao ficou pronta em 90 segundos. Confira o erro no terminal API e reinicie npm run dev apos corrigir.");
  process.exitCode = 1;
} else {
  console.log("API pronta. Iniciando o frontend.");
}
