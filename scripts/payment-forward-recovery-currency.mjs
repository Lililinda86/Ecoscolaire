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

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const parseLabelledFrenchCurrencyAmount = (text, { label, suffix = "" }) => {
  const normalizedText = String(text ?? "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const pattern = new RegExp(
    `^${escapeRegExp(label)}\\s*:\\s*(-?[\\d ]+\\s*FCFA)${suffix ? `\\s*${escapeRegExp(suffix)}` : ""}$`,
  );
  const match = normalizedText.match(pattern);
  assert.ok(match, `Expected the exact labelled FCFA field "${label}"${suffix ? ` with suffix "${suffix}"` : ""}.`);
  return parseFrenchCurrencyAmount(match[1]);
};

export const assertLabelledFrenchCurrencyAmount = (text, { label, expected, suffix = "" }) => {
  assert.equal(parseLabelledFrenchCurrencyAmount(text, { label, suffix }), expected);
};
