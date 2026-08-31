import assert from "node:assert/strict";

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const waitForFinalTuitionQuoteState = async ({
  readState,
  expectedStudentId,
  expectedInstallment,
  expectedGross,
  previousGross = null,
  forbiddenInstallments = [],
  timeoutMs = 20_000,
  pollMs = 100,
}) => {
  assert.equal(typeof readState, "function");
  assert.ok(expectedStudentId, "Expected a target student.");
  assert.ok(expectedInstallment, "Expected a target installment.");
  assert.ok(Number.isSafeInteger(expectedGross), "Expected an exact gross amount.");

  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  let loadingObserved = false;

  while (Date.now() <= deadline) {
    lastState = await readState();
    loadingObserved ||= lastState.loading === true;

    const targetSelected =
      lastState.studentId === expectedStudentId &&
      lastState.installment === expectedInstallment;

    if (targetSelected && Number.isSafeInteger(lastState.currentGross)) {
      for (const forbidden of forbiddenInstallments) {
        assert.ok(
          !lastState.installments.includes(forbidden),
          `Forbidden installment ${forbidden} is exposed for the target class.`,
        );
      }
      if (previousGross !== null && previousGross !== expectedGross) {
        assert.notEqual(
          lastState.currentGross,
          previousGross,
          `The previous quote ${previousGross} is still presented as current.`,
        );
      }
      assert.equal(
        lastState.currentGross,
        expectedGross,
        "The current quote has an unexpected gross amount.",
      );
      return { loadingObserved, state: lastState };
    }

    await delay(pollMs);
  }

  assert.fail(
    `Timed out waiting for final tuition quote state: ${JSON.stringify({
      expectedStudentId,
      expectedInstallment,
      expectedGross,
      lastState,
    })}`,
  );
};
