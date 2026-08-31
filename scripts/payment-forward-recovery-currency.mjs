import assert from "node:assert/strict";

export const normalizeFrenchNumberText = (text) =>
  String(text ?? "").replace(/[\u0020\u00a0\u202f]/g, "");

export const parseFrenchCurrencyAmount = (text) => {
  const normalized = normalizeFrenchNumberText(text);
  assert.match(normalized, /^-?\d+FCFA$/, "Expected an exact FCFA amount.");
  const amount = Number(normalized.slice(0, -4));
  assert.ok(Number.isSafeInteger(amount), "Expected a safe integer FCFA amount.");
  return amount;
};

export const assertFrenchCurrencyAmount = (text, expected) => {
  assert.equal(parseFrenchCurrencyAmount(text), expected);
};
