import { AppError } from "./recipes.js";
import { validDate, expiryRules } from "../src/pantry-expiry.js";
export function validatePantryDates(raw, pantry) {
  const bad = () => {
    throw new AppError(
      "INVALID_PANTRY_DATES",
      "Revisa las fechas y las estimaciones de tu despensa.",
    );
  };
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.keys(raw).length > pantry.length
  )
    bad();
  return Object.fromEntries(
    Object.entries(raw).map(([id, item]) => {
      if (!pantry.includes(id) || !item || typeof item !== "object") bad();
      const {
        startDate = "",
        rule = "",
        customDays = null,
        labelDate = "",
      } = item;
      if (
        typeof startDate !== "string" ||
        typeof labelDate !== "string" ||
        (startDate && !validDate(startDate)) ||
        (labelDate && !validDate(labelDate)) ||
        !["", ...expiryRules.map((r) => r.id)].includes(rule) ||
        (rule && !startDate) ||
        (!rule && !labelDate) ||
        (rule === "custom" &&
          (!Number.isInteger(customDays) ||
            customDays < 1 ||
            customDays > 3650))
      )
        bad();
      return [
        id,
        {
          startDate,
          rule,
          customDays: rule === "custom" ? customDays : null,
          labelDate,
        },
      ];
    }),
  );
}
