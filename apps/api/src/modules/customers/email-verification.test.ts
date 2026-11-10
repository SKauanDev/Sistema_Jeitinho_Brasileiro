import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, codeHash, codeMatches, allowEmailAttempt, consumeEmailCode } from "./email-verification.service.js";
import type { Model, Transaction } from "sequelize";

test("normaliza e valida o e-mail", () => {
  assert.equal(normalizeEmail(" Pessoa@Exemplo.com "), "pessoa@exemplo.com");
  assert.throws(() => normalizeEmail("inválido"));
  assert.throws(() => normalizeEmail("a@b.com\nBcc:foo@bar.com"));
});
test("código vinculado à conta e finalidade", () => {
  const digest = codeHash("account", "RESET", "012345");
  assert.equal(codeMatches("account", "RESET", "012345", digest), true);
  assert.equal(codeMatches("other", "RESET", "012345", digest), false);
  assert.equal(codeMatches("account", "VERIFY", "012345", digest), false);
  assert.equal(codeMatches("account", "RESET", "999999", digest), false);
  assert.equal(codeMatches("account", "RESET", "", digest), false);
});
test("limita solicitações", () => {
  const key = `test-${Date.now()}`;
  assert.equal(allowEmailAttempt(key, 1), true);
  assert.equal(allowEmailAttempt(key, 1), false);
});
test("consumo único, expiração e cinco tentativas", async () => {
  const values: Record<string, any> = { id: "account", emailCodeHash: codeHash("account", "RESET", "012345"), emailCodePurpose: "RESET", emailCodeExpiresAt: new Date(Date.now() + 600000), emailCodeAttempts: 0 };
  const account = { getDataValue: (key: string) => values[key], update: async (changes: object) => Object.assign(values, changes) } as unknown as Model;
  const transaction = {} as Transaction;
  assert.equal(await consumeEmailCode(account, "VERIFY", "012345", transaction), false);
  assert.equal(await consumeEmailCode(account, "RESET", "999999", transaction), false);
  assert.equal(values.emailCodeAttempts, 1);
  assert.equal(await consumeEmailCode(account, "RESET", "012345", transaction), true);
  assert.equal(await consumeEmailCode(account, "RESET", "012345", transaction), false);
  Object.assign(values, { emailCodePurpose: "RESET", emailCodeExpiresAt: new Date(Date.now() - 1), emailCodeAttempts: 0 });
  assert.equal(await consumeEmailCode(account, "RESET", "012345", transaction), false);
  Object.assign(values, { emailCodeExpiresAt: new Date(Date.now() + 600000), emailCodeAttempts: 5 });
  assert.equal(await consumeEmailCode(account, "RESET", "012345", transaction), false);
});
