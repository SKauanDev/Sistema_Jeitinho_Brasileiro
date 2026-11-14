const timeZone = "America/Sao_Paulo";
const parts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date).map(part => [part.type, part.value]));
export function businessDate(date: Date) { const value = parts(date); return `${value.year}-${value.month}-${value.day}`; }
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function shiftDate(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function midnight(date: string) {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const noon = Date.UTC(year, month - 1, day, 12), value = parts(new Date(noon));
  const offset = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second)) - noon;
  return new Date(Date.UTC(year, month - 1, day) - offset);
}
export function financialPeriod(period: string, customStart = "", customEnd = "", now = new Date()) {
  const today = businessDate(now); let startDate = today, endDate = today;
  if (period === "custom") {
    if (!validDate(customStart) || !validDate(customEnd) || customStart > customEnd) throw Error("Selecione um período válido.");
    startDate = customStart; endDate = customEnd;
  } else if (period === "month") startDate = `${today.slice(0, 7)}-01`;
  else if (period === "previous_month") { endDate = shiftDate(`${today.slice(0, 7)}-01`, -1); startDate = `${endDate.slice(0, 7)}-01`; }
  else if (period === "yesterday") startDate = endDate = shiftDate(today, -1);
  else if (period === "7d" || period === "30d") startDate = shiftDate(today, period === "7d" ? -6 : -29);
  return { startDate, endDate, start: midnight(startDate), end: new Date(midnight(shiftDate(endDate, 1)).getTime() - 1) };
}
