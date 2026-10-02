export function todayDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function ageFromBirthDate(value, today = todayDate()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || value > today) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  const [currentYear, currentMonth, currentDay] = today.split("-").map(Number);
  const age =
    currentYear -
    year -
    (currentMonth < month || (currentMonth === month && currentDay < day)
      ? 1
      : 0);
  return age >= 0 && age <= 130 ? age : null;
}
