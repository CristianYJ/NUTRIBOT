import test from "node:test";
import assert from "node:assert/strict";
import { expiryDate, expiryStatus, validDate } from "../src/pantry-expiry.js";
import { validatePantryDates } from "../server/pantry-dates.js";
test("expiry requires a known date and chosen storage; labels override estimates", () => {
  assert.equal(expiryDate(null), null);
  assert.equal(expiryDate({ startDate: "2026-09-29" }), null);
  assert.deepEqual(expiryDate({ startDate: "2026-09-29", rule: "poultry" }), {
    date: "2026-09-30",
    estimated: true,
  });
  assert.deepEqual(
    expiryDate({
      startDate: "2026-09-29",
      rule: "poultry",
      labelDate: "2026-09-29",
    }),
    { date: "2026-09-29", estimated: false },
  );
  assert.equal(
    expiryDate({ startDate: "2026-12-31", rule: "custom", customDays: 2 }).date,
    "2027-01-02",
  );
});
test("date badges handle past, today, upcoming and leap dates without treating them as safe to eat", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(
    expiryStatus({ labelDate: "2026-09-28" }, "2026-09-29").tone,
    "past",
  );
  assert.equal(
    expiryStatus({ labelDate: "2026-09-29" }, "2026-09-29").detail,
    "Hoy",
  );
  assert.equal(
    expiryStatus({ labelDate: "2026-10-01" }, "2026-09-29").tone,
    "soon",
  );
  assert.equal(expiryStatus(null).text, "Sin fecha");
});
test("pantry dates reject foreign ingredient ids, malformed dates and invalid durations", () => {
  const good = {
    startDate: "2026-09-29",
    rule: "custom",
    customDays: 5,
    labelDate: "",
  };
  assert.deepEqual(validatePantryDates({ arroz: good }, ["arroz"]), {
    arroz: good,
  });
  for (const value of [
    { ajeno: good },
    { arroz: { ...good, customDays: 0 } },
    { arroz: { ...good, labelDate: "2026-02-30" } },
    { arroz: { ...good, startDate: false } },
    { arroz: { ...good, rule: "unknown" } },
  ])
    assert.throws(() => validatePantryDates(value, ["arroz"]), {
      code: "INVALID_PANTRY_DATES",
    });
});
