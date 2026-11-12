import assert from "node:assert/strict";
import test from "node:test";
import { tablePathFromQr } from "../src/utils/table-qr";
const key = "a".repeat(64), origin = "https://www.jeitinhobrasileiroap.com";
test("lê QR da mesma origem ou domínio do restaurante e retorna somente a rota local da mesa", () => {
  assert.equal(tablePathFromQr(`${origin}/mesa/${key}`, origin), `/mesa/${key}`);
  assert.equal(tablePathFromQr(`https://comandacom.vercel.app/mesa/${key.toUpperCase()}/`, origin), `/mesa/${key}`);
  assert.equal(tablePathFromQr(`/mesa/${key}`, origin), `/mesa/${key}`);
});
test("QR não pode redirecionar para terceiros, executar código ou abrir uma chave inválida", () => {
  for (const value of [`https://evil.example/mesa/${key}`, `https://www.jeitinhobrasileiroap.com.evil.example/mesa/${key}`, `javascript:alert(1)`, `data:text/html,test`, `${origin}/mesa/test`, `${origin}/mesa/${key}?redirect=evil`, `${origin}/mesa/${key}#extra`, `https://user:pass@www.jeitinhobrasileiroap.com/mesa/${key}`, `${origin}/pedidos`]) assert.equal(tablePathFromQr(value, origin), null);
});
