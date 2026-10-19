import type { AttendanceRecord, AttendanceStatus, ClassSection, StatusCounts, Subject, WeekSchedule } from "./types";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function newId(): string {
  return crypto.randomUUID();
}

/* ---------- Dates (all YYYY-MM-DD in local time) ---------- */

export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function isValidISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(parseISODate(value).getTime());
}

export function formatDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateLong(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatWeekday(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-GB", { weekday: "short" });
}

export function formatDateTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDateTime(isoTimestamp);
}

/* ---------- Class-group schedule ---------- */

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Reads weekday names out of a class-group label such as "Sat-Sun" or
 * "Mon, Wed & Fri". A single "A-B" pair is treated as a range (Mon-Fri =
 * Mon..Fri). Returns weekday indexes (0 = Sunday), or [] if none found.
 */
export function groupWeekdays(group: string): number[] {
  const tokens = group.toLowerCase().match(/[a-z]+/g) ?? [];
  const days = tokens.map((t) => WEEKDAYS.indexOf(t.slice(0, 3))).filter((d) => d >= 0);
  const isRange = days.length === 2 && /^\s*[a-z]+\s*-\s*[a-z]+\s*$/i.test(group);
  if (!isRange) return [...new Set(days)];
  const out: number[] = [];
  for (let d = days[0]; ; d = (d + 1) % 7) {
    out.push(d);
    if (d === days[1]) break;
  }
  return out;
}

export function isScheduledOn(group: string, iso: string): boolean {
  return groupWeekdays(group).includes(parseISODate(iso).getDay());
}

/* ---------- Phones ---------- */

export function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "");
}

/* ---------- Attendance maths ---------- */

export const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused"];

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; badge: string; solid: string; bar: string; ring: string }
> = {
  present: {
    label: "Present",
    short: "P",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    solid: "bg-emerald-600 text-white border-emerald-600",
    bar: "bg-emerald-500",
    ring: "hover:border-emerald-400 hover:text-emerald-700",
  },
  late: {
    label: "Late",
    short: "L",
    badge: "bg-amber-50 text-amber-700 ring-amber-600/20",
    solid: "bg-amber-500 text-white border-amber-500",
    bar: "bg-amber-400",
    ring: "hover:border-amber-400 hover:text-amber-700",
  },
  absent: {
    label: "Absent",
    short: "A",
    badge: "bg-red-50 text-red-700 ring-red-600/20",
    solid: "bg-red-600 text-white border-red-600",
    bar: "bg-red-500",
    ring: "hover:border-red-400 hover:text-red-700",
  },
  excused: {
    label: "Excused",
    short: "E",
    badge: "bg-slate-100 text-slate-600 ring-slate-500/20",
    solid: "bg-slate-500 text-white border-slate-500",
    bar: "bg-slate-400",
    ring: "hover:border-slate-400 hover:text-slate-700",
  },
};

export function countStatuses(records: { status: AttendanceStatus | null }[]): StatusCounts {
  const counts: StatusCounts = { present: 0, late: 0, absent: 0, excused: 0, total: 0 };
  for (const r of records) {
    if (!r.status) continue;
    counts[r.status]++;
    counts.total++;
  }
  return counts;
}

/**
 * Attendance rate = (present + late) / (present + late + absent).
 * Excused marks are left out. Returns null when there is nothing to rate.
 */
export function attendanceRate(c: StatusCounts): number | null {
  const base = c.present + c.late + c.absent;
  return base === 0 ? null : ((c.present + c.late) / base) * 100;
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate)}%`;
}

export function rateColor(rate: number | null): string {
  if (rate === null) return "text-slate-400";
  if (rate >= 90) return "text-emerald-600";
  if (rate >= 75) return "text-amber-600";
  return "text-red-600";
}

export function sessionKey(r: Pick<AttendanceRecord, "date" | "classSectionId" | "subjectId">): string {
  return `${r.date}|${r.classSectionId}|${r.subjectId}`;
}

/* ---------- Sections & timetables ---------- */

export const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The institute week starts on Saturday. */
export const WEEK_ORDER = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_NAMES: Record<string, string> = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

export function dayAbbr(iso: string): string {
  return DAY_ABBR[parseISODate(iso).getDay()];
}

export function dayName(abbr: string): string {
  return DAY_NAMES[abbr] ?? abbr;
}

/** Day abbreviations a class group meets on, in order (e.g. "Sat-Sun" → ["Sat", "Sun"]). */
export function groupDays(group: string): string[] {
  return groupWeekdays(group).map((d) => DAY_ABBR[d]);
}

export function sectionLabel(cs: Pick<ClassSection, "classGroup" | "shift" | "section">): string {
  return `${cs.classGroup} · ${cs.shift} · Section ${cs.section}`;
}

export function sectionShort(cs: Pick<ClassSection, "classGroup" | "shift" | "section">): string {
  return `${cs.classGroup} ${cs.shift} · ${cs.section}`;
}

/** Subject ids scheduled for a section on a given date. */
export function subjectsOn(cs: ClassSection, iso: string): string[] {
  return cs.schedule[dayAbbr(iso)] ?? [];
}

export function hasTimetable(cs: ClassSection): boolean {
  return Object.values(cs.schedule).some((list) => list.length > 0);
}

/** Problems that stop a timetable from being valid: every subject exactly once across the week. */
export function scheduleIssues(schedule: WeekSchedule, days: string[], subjects: Subject[]): string[] {
  if (days.length === 0) return ["This class group has no recognisable weekdays in its name (e.g. \"Sat-Sun\")."];
  const issues: string[] = [];
  for (const subject of subjects) {
    const onDays = days.filter((d) => schedule[d]?.includes(subject.id));
    if (onDays.length === 0) issues.push(`${subject.name} is not scheduled on any day.`);
    else if (onDays.length > 1) issues.push(`${subject.name} is scheduled on ${onDays.length} days — pick only one.`);
  }
  return issues;
}

/** Most recent date on or before `fromIso` (within `lookBack` days) when the subject is taught. */
export function latestSessionDate(cs: ClassSection, subjectId: string, fromIso: string, lookBack = 14): string | null {
  for (let i = 0; i <= lookBack; i++) {
    const d = addDays(fromIso, -i);
    if (subjectsOn(cs, d).includes(subjectId)) return d;
  }
  return null;
}

/* ---------- Files ---------- */

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadFile(filename: string, content: string, mime: string): void {
  // BOM so Excel opens UTF-8 CSV files correctly.
  const blob = new Blob([mime.startsWith("text/csv") ? "﻿" + content : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parses CSV text (RFC 4180 quoting, CRLF/LF). The delimiter is detected from
 * the first line: comma, semicolon or tab. Blank lines are skipped.
 */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": firstLine.split(",").length, ";": firstLine.split(";").length, "\t": firstLine.split("\t").length };
  const delim = (Object.keys(counts) as (keyof typeof counts)[]).reduce((a, b) => (counts[b] > counts[a] ? b : a), ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}
