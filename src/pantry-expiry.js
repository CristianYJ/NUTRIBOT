import { todayDate } from "./date-utils.js";
export const expirySource =
  "https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts";
// Lower end of the published refrigerator ranges. The user confirms storage and start date.
export const expiryRules = [
  { id: "poultry", label: "Pollo o pavo crudo · refrigerado ≤4 °C", days: 1 },
  {
    id: "ground-meat",
    label: "Carne molida cruda · refrigerada ≤4 °C",
    days: 1,
  },
  {
    id: "steak",
    label: "Corte de res o cerdo crudo · refrigerado ≤4 °C",
    days: 3,
  },
  { id: "fish", label: "Pescado fresco · refrigerado ≤4 °C", days: 1 },
  {
    id: "eggs",
    label: "Huevos crudos con cáscara · refrigerados ≤4 °C",
    days: 21,
  },
  { id: "boiled-eggs", label: "Huevos cocidos · refrigerados ≤4 °C", days: 7 },
  { id: "soup", label: "Sopa o guiso preparado · refrigerado ≤4 °C", days: 3 },
  {
    id: "cooked-meat",
    label: "Carne o pollo cocinado · refrigerado ≤4 °C",
    days: 3,
  },
  { id: "custom", label: "Mi propia estimación", days: null },
];
export function validDate(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value || "") ||
    value < "1900-01-01" ||
    value > "2200-12-31"
  )
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function expiryDate(record) {
  if (!record) return null;
  if (validDate(record.labelDate))
    return { date: record.labelDate, estimated: false };
  const rule = expiryRules.find((item) => item.id === record.rule);
  const days = rule?.id === "custom" ? record.customDays : rule?.days;
  if (
    !validDate(record.startDate) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 3650
  )
    return null;
  const date = new Date(record.startDate + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return { date: date.toISOString().slice(0, 10), estimated: true };
}
export function expiryStatus(record, today = todayDate()) {
  const expiry = expiryDate(record);
  if (!expiry)
    return { tone: "unknown", text: "Sin fecha", detail: "Añadir vencimiento" };
  const days = Math.round(
    (Date.parse(expiry.date + "T00:00:00Z") -
      Date.parse(today + "T00:00:00Z")) /
      86400000,
  );
  return {
    ...expiry,
    days,
    tone: days < 0 ? "past" : days <= 2 ? "soon" : "dated",
    text: expiry.estimated ? "Vencimiento estimado" : "Fecha del envase",
    detail:
      days < 0
        ? "Fecha pasada"
        : days === 0
          ? "Hoy"
          : `En ${days} día${days === 1 ? "" : "s"}`,
  };
}
