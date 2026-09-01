import assert from "node:assert/strict";
import { parseFrenchCurrencyAmount } from "./payment-forward-recovery-currency.mjs";

const normalized = (value) => String(value || "").replace(/[\s\u00a0\u202f]+/g, " ").trim();
const escaped = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const assertTransportBenefitAppliedToQuote = ({
  benefitTexts,
  quoteText,
  reference,
  benefitType,
  expectedDiscount,
  gross,
  discount,
  net,
  forbiddenReferences = [],
}) => {
  const identity = new RegExp(`${escaped(benefitType)} \\(${escaped(reference)}\\)`);
  const matches = benefitTexts.filter(text => identity.test(normalized(text)));
  assert.equal(matches.length, 1, `Expected exactly one ${benefitType} (${reference}) in the current quote.`);
  const amountMatch = normalized(matches[0]).match(new RegExp(
    `^•?\\s*${escaped(benefitType)} \\(${escaped(reference)}\\)\\s*:\\s*-\\s*([\\d ]+ FCFA)$`,
  ));
  assert.ok(amountMatch, `Expected a strict amount for ${benefitType} (${reference}).`);
  assert.equal(parseFrenchCurrencyAmount(amountMatch[1]), expectedDiscount);
  assert.equal(discount, expectedDiscount);
  assert.equal(gross - discount, net, "The Transport benefit must be the only cause of the quote reduction.");
  for (const forbiddenReference of forbiddenReferences) {
    assert.equal(normalized(quoteText).includes(forbiddenReference), false,
      `${forbiddenReference} must not be applied to the Transport quote.`);
  }
};

export const exactReceiptRowSelector = (receiptNumber) => {
  assert.equal(typeof receiptNumber, "string");
  assert.ok(receiptNumber.trim(), "Receipt number is required.");
  return `[data-receipt-row="true"][data-receipt-number=${JSON.stringify(receiptNumber)}]:visible`;
};

export const assertStructuredReceiptAllocationRows = async (
  rows,
  expected,
  { creditLabel = "Crédit Transport" } = {},
) => {
  const rowCount = await rows.count();
  assert.equal(rowCount, expected.length, "Receipt allocation row count must be exact.");

  for (const [index, item] of expected.entries()) {
    const row = rows.nth(index);
    const labelElement = row.locator(":scope > span");
    const amountElement = row.locator(":scope > strong");
    assert.equal(await labelElement.count(), 1,
      `Receipt allocation ${index} must have exactly one direct label.`);
    assert.equal(await amountElement.count(), 1,
      `Receipt allocation ${index} must have exactly one direct amount.`);

    const expectedLabel = item.kind === "CREDIT"
      ? creditLabel
      : `Période ${item.period}`;
    assert.equal(normalized(await labelElement.textContent()), expectedLabel,
      `Unexpected receipt allocation label at index ${index}.`);
    assert.equal(parseFrenchCurrencyAmount(await amountElement.textContent()), item.amount,
      `Unexpected receipt allocation amount at index ${index}.`);
  }
};
