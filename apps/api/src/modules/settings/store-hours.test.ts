import assert from "node:assert/strict";
import test from "node:test";
import { isWithinOpeningHours, normalizeOpeningHours } from "./store-hours.js";
const week = () =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isClosed: true,
    opensAt: null as string | null,
    closesAt: null as string | null,
  }));
test("horários: valida sete dias distintos e recusa dia aberto com horários vazios", () => {
  const hours = week();
  assert.equal(normalizeOpeningHours(hours).length, 7);
  assert.throws(() => normalizeOpeningHours(hours.slice(1)));
  assert.throws(() => normalizeOpeningHours(hours.map(() => hours[0])));
  hours[1]!.isClosed = false;
  assert.throws(() => normalizeOpeningHours(hours));
  hours[1]!.opensAt = "18:00";
  hours[1]!.closesAt = "25:00";
  assert.throws(() => normalizeOpeningHours(hours));
  hours[1]!.closesAt = "23:30:00";
  assert.equal(normalizeOpeningHours(hours)[1]!.closesAt, "23:30");
});
test("horários: abertura e fechamento no fuso de São Paulo, incluindo virada e domingo", () => {
  const hours = week();
  hours[1] = {
    dayOfWeek: 1,
    isClosed: false,
    opensAt: "18:00",
    closesAt: "02:00",
  };
  const open = (date: string) => isWithinOpeningHours(hours, new Date(date));
  assert.equal(open("2026-11-16T20:59:00Z"), false);
  assert.equal(open("2026-11-16T21:00:00Z"), true);
  assert.equal(open("2026-11-17T04:59:00Z"), true);
  assert.equal(open("2026-11-17T05:00:00Z"), false);
  hours[6] = {
    dayOfWeek: 6,
    isClosed: false,
    opensAt: "18:00",
    closesAt: "02:00",
  };
  assert.equal(open("2026-11-15T04:59:00Z"), true);
  assert.equal(open("2026-11-15T05:00:00Z"), false);
  hours[1]!.closesAt = "23:30";
  assert.equal(open("2026-11-17T02:29:00Z"), true);
  assert.equal(open("2026-11-17T02:30:00Z"), false);
  assert.equal(isWithinOpeningHours([], new Date()), true);
});
