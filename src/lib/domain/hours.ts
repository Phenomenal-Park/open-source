// Operating hours. Minutes from 00:00; close may be 1440 (24:00) or more (after midnight) (§56).
export type DayHours = { weekday: number; is_open: boolean; open_min: number; close_min: number };

export const AREA_DEFAULT_HOURS: DayHours[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  is_open: true,
  open_min: weekday <= 5 ? 960 : 780,
  close_min: 1440,
}));

export function effectiveHours(mode: string | undefined, custom: DayHours[] | null | undefined, defaults: DayHours[] | null | undefined): DayHours[] {
  if (mode === "CUSTOM" && custom && custom.length === 7) return [...custom].sort((a, b) => a.weekday - b.weekday);
  return defaults && defaults.length === 7 ? defaults : AREA_DEFAULT_HOURS;
}

/** Current Seoul weekday (ISO 1–7) and minute of day. */
export function seoulClock(now: Date = new Date()): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { weekday: wd, minute: parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10) };
}

export function isOpenAt(days: DayHours[], weekday: number, minute: number): boolean {
  const today = days.find((d) => d.weekday === weekday);
  if (today?.is_open && minute >= today.open_min && minute < today.close_min) return true;
  // yesterday's window running past midnight
  const yWd = weekday === 1 ? 7 : weekday - 1;
  const y = days.find((d) => d.weekday === yWd);
  return !!(y?.is_open && y.close_min > 1440 && minute + 1440 < y.close_min);
}

export function isOpenNow(days: DayHours[], now?: Date): boolean {
  const { weekday, minute } = seoulClock(now);
  return isOpenAt(days, weekday, minute);
}

/** "16:00", "24:00"; minutes beyond 24:00 are rendered as next-day clock time with nextDay=true. */
export function formatMinute(m: number): { text: string; nextDay: boolean } {
  if (m === 1440) return { text: "24:00", nextDay: false };
  const nextDay = m > 1440;
  const mm = nextDay ? m - 1440 : m;
  return { text: `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`, nextDay };
}

/** Parse "16:00" / "24:00" / "02:00" (+ nextDay) into minutes. */
export function parseTime(text: string, nextDay = false): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const v = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  if (v > 1440 || parseInt(m[2], 10) > 59) return null;
  return nextDay && v < 1440 ? v + 1440 : v;
}

export type HoursGroup = { from: number; to: number; is_open: boolean; open_min: number; close_min: number };

/** Group consecutive weekdays with identical hours: Mon–Fri 16:00–24:00, Sat–Sun 13:00–24:00. */
export function groupHours(days: DayHours[]): HoursGroup[] {
  const out: HoursGroup[] = [];
  for (const d of [...days].sort((a, b) => a.weekday - b.weekday)) {
    const last = out[out.length - 1];
    const same = last && last.is_open === d.is_open && (!d.is_open || (last.open_min === d.open_min && last.close_min === d.close_min));
    if (same && last.to === d.weekday - 1) last.to = d.weekday;
    else out.push({ from: d.weekday, to: d.weekday, is_open: d.is_open, open_min: d.open_min, close_min: d.close_min });
  }
  return out;
}

export function isDefaultHours(days: DayHours[], defaults: DayHours[] = AREA_DEFAULT_HOURS): boolean {
  return days.every((d) => {
    const x = defaults.find((y) => y.weekday === d.weekday);
    return x && x.is_open === d.is_open && x.open_min === d.open_min && x.close_min === d.close_min;
  });
}
