import assert from "node:assert/strict";

const normalizeOptionLabel = (value) => String(value || "").replace(/\s+/g, " ").trim();

export const selectStudentClassOption = async ({
  form,
  classId,
  expectedLabel,
  timeout = 30_000,
}) => {
  assert.match(classId, /^[A-Za-z0-9_-]+$/, "classId must be safe for an exact option selector");
  assert.ok(expectedLabel, "expectedLabel is required");

  const option = form.locator(`option[value="${classId}"]`);
  await option.waitFor({ state: "attached", timeout });
  assert.equal(await option.count(), 1, `expected one class option for ${classId}`);
  assert.equal(await option.getAttribute("value"), classId);
  assert.equal(normalizeOptionLabel(await option.textContent()), expectedLabel);

  const select = form.locator(`select:has(option[value="${classId}"])`);
  await select.waitFor({ state: "attached", timeout });
  assert.equal(await select.count(), 1, `class option ${classId} must belong to one select`);
  await select.selectOption({ value: classId });
  assert.equal(await select.inputValue(), classId);
  assert.equal(
    normalizeOptionLabel(await select.locator("option:checked").textContent()),
    expectedLabel,
  );

  return select;
};
