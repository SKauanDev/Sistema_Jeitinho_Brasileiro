export type OpeningHour = {
  dayOfWeek: number;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};
const minutesOf = (time: unknown) => {
  if (
    typeof time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)
  )
    return -1;
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};

export function normalizeOpeningHours(input: unknown): OpeningHour[] {
  if (!Array.isArray(input) || input.length !== 7)
    throw Error("Configure os sete dias da semana.");
  const days = new Set<number>();
  return input.map((hour) => {
    const day = hour?.dayOfWeek;
    if (!Number.isInteger(day) || day < 0 || day > 6 || days.has(day))
      throw Error("Informe cada dia da semana uma única vez.");
    days.add(day);
    if (typeof hour.isClosed !== "boolean")
      throw Error("Informe se o dia está aberto ou fechado.");
    if (hour.isClosed)
      return { dayOfWeek: day, isClosed: true, opensAt: null, closesAt: null };
    if (minutesOf(hour.opensAt) < 0 || minutesOf(hour.closesAt) < 0)
      throw Error("Preencha abertura e fechamento dos dias abertos.");
    return {
      dayOfWeek: day,
      isClosed: false,
      opensAt: hour.opensAt.slice(0, 5),
      closesAt: hour.closesAt.slice(0, 5),
    };
  });
}

export function isWithinOpeningHours(hours: OpeningHour[], now = new Date()) {
  if (!hours.length) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    values.weekday ?? "",
  );
  const minute = Number(values.hour) * 60 + Number(values.minute);
  const inside = (entry: OpeningHour | undefined, previous = false) => {
    if (!entry || entry.isClosed) return false;
    const opens = minutesOf(entry.opensAt),
      closes = minutesOf(entry.closesAt);
    if (opens < 0 || closes < 0) return false;
    if (opens < closes) return !previous && minute >= opens && minute < closes;
    return previous ? minute < closes : minute >= opens;
  };
  return (
    inside(hours.find((entry) => entry.dayOfWeek === day)) ||
    inside(
      hours.find((entry) => entry.dayOfWeek === (day + 6) % 7),
      true,
    )
  );
}
