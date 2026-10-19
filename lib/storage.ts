// Data layer. Every read and write in the app goes through these helpers,
// so swapping localStorage for a real API only means rewriting this file.

import type {
  ActivityCategory,
  ActivityEntry,
  AppData,
  AttendanceEntry,
  AttendanceRecord,
  AttendanceStatus,
  BackupFile,
  ClassSection,
  Flags,
  Session,
  SessionRef,
  Settings,
  StoreState,
  Student,
  StudentInput,
  Subject,
  TeacherInput,
  User,
  WeekSchedule,
} from "./types";
import {
  STATUSES,
  countStatuses,
  groupDays,
  isValidISODate,
  newId,
  normalizePhone,
  scheduleIssues,
  sectionLabel,
  sectionShort,
  subjectsOn,
  todayISO,
} from "./utils";

export const STORAGE_KEYS = {
  settings: "iap.settings",
  subjects: "iap.subjects",
  sections: "iap.sections",
  students: "iap.students",
  attendance: "iap.attendance",
  users: "iap.users",
  session: "iap.session",
  flags: "iap.flags",
  activity: "iap.activity",
} as const;

/** Oldest activity entries are dropped beyond this many. */
const MAX_ACTIVITY = 2000;

/** Pre-upgrade attendance (no subject/section) is moved here and never deleted. */
export const ARCHIVE_KEY = "iap.attendance.archive";
const SCHEMA_KEY = "iap.schema";
const SCHEMA_VERSION = 2;

/** Keys holding institute data (backed up / erased); users, session and flags are separate. */
const DATA_KEYS = [STORAGE_KEYS.settings, STORAGE_KEYS.subjects, STORAGE_KEYS.sections, STORAGE_KEYS.students, STORAGE_KEYS.attendance];

export const DEFAULT_PRINCIPAL_ID = "default-principal";
export const DEFAULT_PRINCIPAL_PASSWORD = "admin123";

/** Seeded on first run (until users are first saved) so there is always a way in. */
const DEFAULT_PRINCIPAL: User = {
  id: DEFAULT_PRINCIPAL_ID,
  username: "principal",
  password: DEFAULT_PRINCIPAL_PASSWORD,
  name: "Principal",
  role: "principal",
  assignedSessions: [],
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const DEFAULT_SETTINGS: Settings = {
  instituteName: "My Institute",
  logoEmoji: "🎓",
  classGroups: ["Sat-Sun", "Mon-Tue", "Thu-Fri"],
  shifts: ["AM", "PM"],
};

/** Stable ids so demo data and seeded installs agree. */
export const DEFAULT_SUBJECTS: Subject[] = [
  { id: "subject-drawing", name: "Drawing" },
  { id: "subject-pattern-making", name: "Pattern Making" },
  { id: "subject-tailoring", name: "Tailoring" },
];

const SERVER_DATA: StoreState = {
  settings: DEFAULT_SETTINGS,
  subjects: DEFAULT_SUBJECTS,
  sections: [],
  students: [],
  attendance: [],
  users: [],
  session: null,
  flags: {},
  activity: [],
};

/** One section "A" with an empty timetable for every class group × shift. */
export function defaultSections(settings: Settings): ClassSection[] {
  return settings.classGroups.flatMap((classGroup) =>
    settings.shifts.map((shift) => ({ id: newId(), classGroup, shift, section: "A", schedule: {} })),
  );
}

/* ---------- Sanitizing (used for localStorage reads and backup imports) ---------- */

const isStr = (v: unknown): v is string => typeof v === "string";
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const optStr = (v: unknown) => (isStr(v) && v.trim() ? v.trim() : undefined);

function cleanStringList(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const list = [...new Set(v.filter(isStr).map((s) => s.trim()).filter(Boolean))];
  return list.length ? list : fallback;
}

function cleanSettings(v: unknown): Settings {
  const o = isObj(v) ? v : {};
  return {
    instituteName: optStr(o.instituteName) ?? DEFAULT_SETTINGS.instituteName,
    logoEmoji: optStr(o.logoEmoji) ?? DEFAULT_SETTINGS.logoEmoji,
    classGroups: cleanStringList(o.classGroups, DEFAULT_SETTINGS.classGroups),
    shifts: cleanStringList(o.shifts, DEFAULT_SETTINGS.shifts),
  };
}

function cleanSubjects(v: unknown): Subject[] {
  if (!Array.isArray(v)) return DEFAULT_SUBJECTS;
  const seen = new Set<string>();
  return v.flatMap((s): Subject[] => {
    if (!isObj(s) || !isStr(s.id) || !optStr(s.name)) return [];
    const key = (s.name as string).trim().toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: s.id, name: (s.name as string).trim() }];
  });
}

function cleanSchedule(v: unknown): WeekSchedule {
  if (!isObj(v)) return {};
  const out: WeekSchedule = {};
  for (const [day, list] of Object.entries(v)) {
    if (Array.isArray(list)) out[day] = [...new Set(list.filter(isStr))];
  }
  return out;
}

function cleanSections(v: unknown): ClassSection[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((s): ClassSection[] => {
    if (!isObj(s) || !isStr(s.id) || !isStr(s.classGroup) || !isStr(s.shift) || !optStr(s.section)) return [];
    return [{ id: s.id, classGroup: s.classGroup, shift: s.shift, section: (s.section as string).trim(), schedule: cleanSchedule(s.schedule) }];
  });
}

function cleanStudents(v: unknown): Student[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((s): Student[] => {
    if (!isObj(s)) return [];
    if (!isStr(s.id) || !optStr(s.fullName) || !optStr(s.phone) || !isStr(s.classGroup) || !isStr(s.shift)) return [];
    return [
      {
        id: s.id,
        fullName: (s.fullName as string).trim(),
        phone: (s.phone as string).trim(),
        email: optStr(s.email),
        classGroup: s.classGroup,
        shift: s.shift,
        section: optStr(s.section) ?? "A",
        status: s.status === "inactive" ? "inactive" : "active",
        joinedAt: isValidISODate(s.joinedAt) ? s.joinedAt : todayISO(),
        notes: optStr(s.notes),
      },
    ];
  });
}

/** Records from before subjects/sections existed. */
const isLegacyRecord = (r: unknown) => isObj(r) && !isStr(r.classSectionId);

function cleanAttendance(v: unknown): AttendanceRecord[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r): AttendanceRecord[] => {
    if (!isObj(r)) return [];
    if (
      !isStr(r.id) ||
      !isValidISODate(r.date) ||
      !isStr(r.classSectionId) ||
      !isStr(r.subjectId) ||
      !isStr(r.studentId) ||
      !STATUSES.includes(r.status as AttendanceStatus)
    )
      return [];
    return [
      {
        id: r.id,
        date: r.date,
        classSectionId: r.classSectionId,
        subjectId: r.subjectId,
        studentId: r.studentId,
        status: r.status as AttendanceStatus,
        note: optStr(r.note),
        recordedById: isStr(r.recordedById) ? r.recordedById : "",
        recordedByName: optStr(r.recordedByName) ?? "Unknown",
        recordedAt: isStr(r.recordedAt) ? r.recordedAt : new Date().toISOString(),
      },
    ];
  });
}

function cleanSessionRefs(v: unknown): SessionRef[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((a): SessionRef[] => {
    if (!isObj(a) || !isStr(a.classSectionId) || !isStr(a.subjectId)) return [];
    const key = `${a.classSectionId}|${a.subjectId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ classSectionId: a.classSectionId, subjectId: a.subjectId }];
  });
}

function cleanUsers(v: unknown): User[] {
  // Nothing stored yet → first run: only the default principal exists.
  if (!Array.isArray(v)) return [DEFAULT_PRINCIPAL];
  const users = v.flatMap((u): User[] => {
    if (!isObj(u)) return [];
    if (!isStr(u.id) || !optStr(u.username) || !isStr(u.password) || !optStr(u.name)) return [];
    const role = u.role === "principal" ? "principal" : "teacher";
    return [
      {
        id: u.id,
        username: (u.username as string).trim(),
        password: u.password,
        name: (u.name as string).trim(),
        role,
        assignedSessions: role === "teacher" ? cleanSessionRefs(u.assignedSessions) : [],
        active: u.active !== false,
        createdAt: isStr(u.createdAt) ? u.createdAt : new Date().toISOString(),
      },
    ];
  });
  // Never allow a state with no way to sign in as principal.
  return users.some((u) => u.role === "principal" && u.active) ? users : [DEFAULT_PRINCIPAL, ...users];
}

function cleanSession(v: unknown): Session | null {
  if (!isObj(v) || !isStr(v.userId) || !isStr(v.loggedInAt)) return null;
  return { userId: v.userId, loggedInAt: v.loggedInAt, notice: v.notice === "default-password" ? v.notice : undefined };
}

function cleanFlags(v: unknown): Flags {
  if (!isObj(v)) return {};
  const n = v.upgradeNotice;
  return {
    defaultPasswordNotice: v.defaultPasswordNotice === true,
    upgradeNotice: isObj(n)
      ? { archivedRecords: Number(n.archivedRecords) || 0, resetTeachers: Number(n.resetTeachers) || 0 }
      : null,
    lastBackupAt: isStr(v.lastBackupAt) ? v.lastBackupAt : undefined,
    backupSnoozedUntil: isStr(v.backupSnoozedUntil) ? v.backupSnoozedUntil : undefined,
  };
}

const ACTIVITY_CATEGORIES: ActivityCategory[] = ["student", "attendance", "teacher", "class", "settings", "data", "auth"];

function cleanActivity(v: unknown): ActivityEntry[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e): ActivityEntry[] => {
    if (!isObj(e) || !isStr(e.id) || !isStr(e.at) || !isStr(e.action)) return [];
    return [
      {
        id: e.id,
        at: e.at,
        actorId: isStr(e.actorId) ? e.actorId : "",
        actorName: optStr(e.actorName) ?? "System",
        category: ACTIVITY_CATEGORIES.includes(e.category as ActivityCategory) ? (e.category as ActivityCategory) : "data",
        action: e.action,
        summary: isStr(e.summary) ? e.summary : "",
      },
    ];
  });
}

/* ---------- Raw localStorage access ---------- */

function readJSON(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeJSON(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getArchive(): unknown[] {
  const v = readJSON(ARCHIVE_KEY);
  return Array.isArray(v) ? v : [];
}

function appendArchive(records: unknown[]): void {
  if (records.length) writeJSON(ARCHIVE_KEY, [...getArchive(), ...records]);
}

/* ---------- One-time migration to subjects / sections (schema v2) ---------- */

/**
 * Pre-v2 data: attendance had classGroup + shift but no subject or section, and
 * teachers had assignedClasses. Old attendance is archived (never deleted),
 * students move to section "A", teacher assignments are cleared because they
 * can't be mapped to subjects, and default subjects + sections are seeded.
 */
function migrate(): void {
  try {
    if (Number(readJSON(SCHEMA_KEY) ?? 1) >= SCHEMA_VERSION) return;

    const rawAttendance = readJSON(STORAGE_KEYS.attendance);
    const legacy = Array.isArray(rawAttendance) ? rawAttendance.filter(isLegacyRecord) : [];
    if (legacy.length) {
      appendArchive(legacy);
      writeJSON(STORAGE_KEYS.attendance, (rawAttendance as unknown[]).filter((r) => !isLegacyRecord(r)));
    }

    const rawStudents = readJSON(STORAGE_KEYS.students);
    if (Array.isArray(rawStudents)) {
      writeJSON(
        STORAGE_KEYS.students,
        rawStudents.map((s) => (isObj(s) && !optStr(s.section) ? { ...s, section: "A" } : s)),
      );
    }

    let resetTeachers = 0;
    const rawUsers = readJSON(STORAGE_KEYS.users);
    if (Array.isArray(rawUsers)) {
      writeJSON(
        STORAGE_KEYS.users,
        rawUsers.map((u) => {
          if (!isObj(u) || Array.isArray(u.assignedSessions)) return u;
          if (u.role === "teacher" && Array.isArray(u.assignedClasses) && u.assignedClasses.length) resetTeachers++;
          const { assignedClasses: _old, ...rest } = u;
          void _old;
          return { ...rest, assignedSessions: [] };
        }),
      );
    }

    if (readJSON(STORAGE_KEYS.subjects) === undefined) writeJSON(STORAGE_KEYS.subjects, DEFAULT_SUBJECTS);
    if (readJSON(STORAGE_KEYS.sections) === undefined) {
      writeJSON(STORAGE_KEYS.sections, defaultSections(cleanSettings(readJSON(STORAGE_KEYS.settings))));
    }

    const hadOldData = legacy.length > 0 || (Array.isArray(rawStudents) && rawStudents.length > 0);
    if (hadOldData) {
      const flags = cleanFlags(readJSON(STORAGE_KEYS.flags));
      writeJSON(STORAGE_KEYS.flags, { ...flags, upgradeNotice: { archivedRecords: legacy.length, resetTeachers } });
    }
    writeJSON(SCHEMA_KEY, SCHEMA_VERSION);
  } catch {
    // Storage unavailable: the app still renders with sanitized defaults.
  }
}

/* ---------- Cache + subscriptions (consumed by useSyncExternalStore) ---------- */

let cache: StoreState | null = null;
const listeners = new Set<() => void>();

function load(): StoreState {
  migrate();
  const settings = cleanSettings(readJSON(STORAGE_KEYS.settings));
  let sections = cleanSections(readJSON(STORAGE_KEYS.sections));
  // Self-heal after an erase: sections need stable ids, so persist the defaults.
  if (readJSON(STORAGE_KEYS.sections) === undefined) {
    sections = defaultSections(settings);
    try {
      writeJSON(STORAGE_KEYS.sections, sections);
    } catch {
      // ignore — ids just won't persist until the next successful write
    }
  }
  return {
    settings,
    subjects: cleanSubjects(readJSON(STORAGE_KEYS.subjects)),
    sections,
    students: cleanStudents(readJSON(STORAGE_KEYS.students)),
    attendance: cleanAttendance(readJSON(STORAGE_KEYS.attendance)),
    users: cleanUsers(readJSON(STORAGE_KEYS.users)),
    session: cleanSession(readJSON(STORAGE_KEYS.session)),
    flags: cleanFlags(readJSON(STORAGE_KEYS.flags)),
    activity: cleanActivity(readJSON(STORAGE_KEYS.activity)),
  };
}

function notify() {
  listeners.forEach((fn) => fn());
}

function onStorageEvent(e: StorageEvent) {
  if (e.key === null || e.key.startsWith("iap.")) {
    cache = null;
    notify();
  }
}

export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorageEvent);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorageEvent);
  };
}

export function getData(): StoreState {
  if (!cache) cache = load();
  return cache;
}

export function getServerData(): StoreState {
  return SERVER_DATA;
}

export interface LogInput {
  category: ActivityCategory;
  action: string;
  summary: string;
  /** Defaults to the signed-in user. */
  actor?: User | null;
}

/** Writes changed keys and, when `log` is given, prepends an activity entry in the same write. */
function commit(patch: Partial<StoreState>, log?: LogInput): void {
  const base = getData();
  if (log) {
    const actor = log.actor !== undefined ? log.actor : getCurrentUser(base);
    const entry: ActivityEntry = {
      id: newId(),
      at: new Date().toISOString(),
      actorId: actor?.id ?? "",
      actorName: actor?.name ?? "System",
      category: log.category,
      action: log.action,
      summary: log.summary,
    };
    patch = { ...patch, activity: [entry, ...(patch.activity ?? base.activity)].slice(0, MAX_ACTIVITY) };
  }
  const next = { ...base, ...patch };
  try {
    for (const key of Object.keys(patch) as (keyof StoreState)[]) {
      if (next[key] === null) window.localStorage.removeItem(STORAGE_KEYS[key]);
      else writeJSON(STORAGE_KEYS[key], next[key]);
    }
  } catch {
    throw new Error("Could not save — browser storage is full or unavailable.");
  }
  cache = next;
  notify();
}

/** Records an action that has no data change of its own (e.g. a download). */
export function logActivity(log: LogInput): void {
  commit({}, log);
}

/* ---------- Settings ---------- */

export function getSettings(): Settings {
  return getData().settings;
}

/** Institute name and logo. Class groups and shifts have their own helpers below. */
export function updateSettings(patch: Pick<Partial<Settings>, "instituteName" | "logoEmoji">): Settings {
  const settings = cleanSettings({ ...getSettings(), ...patch });
  commit(
    { settings },
    { category: "settings", action: "Institute profile updated", summary: `${settings.logoEmoji} ${settings.instituteName}` },
  );
  return settings;
}

/** Why a class group / shift can't be removed, or null if it can. */
function listItemInUse(kind: "classGroup" | "shift", value: string): string | null {
  const { students, sections, users, attendance } = getData();
  const sectionIds = new Set(sections.filter((s) => s[kind] === value).map((s) => s.id));
  const studentCount = students.filter((s) => s[kind] === value).length;
  if (studentCount) return `${studentCount} student${studentCount === 1 ? " is" : "s are"} enrolled in it. Move or delete them first.`;
  const teacherCount = users.filter((u) => u.assignedSessions.some((a) => sectionIds.has(a.classSectionId))).length;
  if (teacherCount) return `${teacherCount} teacher${teacherCount === 1 ? " is" : "s are"} assigned to it. Update them on the Teachers page first.`;
  if (attendance.some((r) => sectionIds.has(r.classSectionId))) return "It has saved attendance records.";
  return null;
}

function addListItem(kind: "classGroups" | "shifts", value: string): void {
  const v = value.trim();
  const settings = getSettings();
  if (!v) throw new Error("Enter a name.");
  if (settings[kind].some((i) => i.toLowerCase() === v.toLowerCase())) throw new Error(`"${v}" already exists.`);
  const nextSettings = { ...settings, [kind]: [...settings[kind], v] };
  // Every new class group × shift combination starts with section "A".
  const existing = getSections();
  const added = defaultSections(nextSettings).filter(
    (d) => !existing.some((s) => s.classGroup === d.classGroup && s.shift === d.shift),
  );
  commit(
    { settings: nextSettings, sections: [...existing, ...added] },
    { category: "settings", action: kind === "classGroups" ? "Class group added" : "Shift added", summary: v },
  );
}

function removeListItem(kind: "classGroups" | "shifts", value: string): void {
  const settings = getSettings();
  if (settings[kind].length === 1) throw new Error("Keep at least one option.");
  const reason = listItemInUse(kind === "classGroups" ? "classGroup" : "shift", value);
  if (reason) throw new Error(reason);
  const field = kind === "classGroups" ? "classGroup" : "shift";
  commit(
    {
      settings: { ...settings, [kind]: settings[kind].filter((i) => i !== value) },
      sections: getSections().filter((s) => s[field] !== value),
    },
    { category: "settings", action: kind === "classGroups" ? "Class group removed" : "Shift removed", summary: value },
  );
}

export const addClassGroup = (name: string) => addListItem("classGroups", name);
export const removeClassGroup = (name: string) => removeListItem("classGroups", name);
export const addShift = (name: string) => addListItem("shifts", name);
export const removeShift = (name: string) => removeListItem("shifts", name);

/* ---------- Subjects ---------- */

export function getSubjects(): Subject[] {
  return getData().subjects;
}

function assertSubjectName(name: string, excludeId?: string): string {
  const n = name.trim();
  if (!n) throw new Error("Enter a subject name.");
  if (n.length > 40) throw new Error("Subject names can be at most 40 characters.");
  if (getSubjects().some((s) => s.id !== excludeId && s.name.toLowerCase() === n.toLowerCase())) {
    throw new Error(`"${n}" already exists.`);
  }
  return n;
}

export function addSubject(name: string): Subject {
  const subject = { id: newId(), name: assertSubjectName(name) };
  commit({ subjects: [...getSubjects(), subject] }, { category: "class", action: "Subject added", summary: subject.name });
  return subject;
}

export function renameSubject(id: string, name: string): Subject {
  const n = assertSubjectName(name, id);
  const old = getSubjects().find((s) => s.id === id)?.name ?? "";
  const subjects = getSubjects().map((s) => (s.id === id ? { ...s, name: n } : s));
  commit({ subjects }, { category: "class", action: "Subject renamed", summary: `${old} → ${n}` });
  return subjects.find((s) => s.id === id)!;
}

/** Why a subject can't be deleted, or null if it can. */
export function subjectInUse(id: string): string | null {
  const { sections, users, attendance } = getData();
  const inTimetables = sections.filter((s) => Object.values(s.schedule).some((l) => l.includes(id))).length;
  if (inTimetables) return `It is used in ${inTimetables} timetable${inTimetables === 1 ? "" : "s"}. Remove it from those first.`;
  const teachers = users.filter((u) => u.assignedSessions.some((a) => a.subjectId === id)).length;
  if (teachers) return `${teachers} teacher${teachers === 1 ? " is" : "s are"} assigned to it.`;
  if (attendance.some((r) => r.subjectId === id)) return "It has saved attendance records. Rename it instead.";
  return null;
}

export interface DeletedSubject {
  subject: Subject;
  index: number;
}

/** Deletes an unused subject and returns what's needed to undo it. */
export function deleteSubject(id: string): DeletedSubject {
  const reason = subjectInUse(id);
  if (reason) throw new Error(reason);
  const subjects = getSubjects();
  const index = subjects.findIndex((s) => s.id === id);
  if (index === -1) throw new Error("Subject not found.");
  commit({ subjects: subjects.filter((s) => s.id !== id) }, { category: "class", action: "Subject deleted", summary: subjects[index].name });
  return { subject: subjects[index], index };
}

export function restoreSubject({ subject, index }: DeletedSubject): void {
  const subjects = getSubjects();
  if (subjects.some((s) => s.id === subject.id)) return;
  if (subjects.some((s) => s.name.toLowerCase() === subject.name.toLowerCase())) {
    throw new Error(`A subject named "${subject.name}" exists again.`);
  }
  const next = [...subjects];
  next.splice(Math.min(index, next.length), 0, subject);
  commit({ subjects: next }, { category: "class", action: "Subject restored", summary: subject.name });
}

/* ---------- Class sections & timetables ---------- */

export function getSections(): ClassSection[] {
  return getData().sections;
}

export function getSection(id: string): ClassSection | undefined {
  return getSections().find((s) => s.id === id);
}

export function findSection(classGroup: string, shift: string, section: string): ClassSection | undefined {
  return getSections().find((s) => s.classGroup === classGroup && s.shift === shift && s.section === section);
}

/** Adds the next lettered section (A, B, C, …) for a class group + shift. */
export function addSection(classGroup: string, shift: string): ClassSection {
  const taken = new Set(getSections().filter((s) => s.classGroup === classGroup && s.shift === shift).map((s) => s.section));
  let code = 65;
  while (taken.has(String.fromCharCode(code)) && code < 90) code++;
  const section: ClassSection = { id: newId(), classGroup, shift, section: String.fromCharCode(code), schedule: {} };
  commit({ sections: [...getSections(), section] }, { category: "class", action: "Section added", summary: sectionLabel(section) });
  return section;
}

export function sectionInUse(id: string): string | null {
  const { sections, students, users, attendance } = getData();
  const cs = sections.find((s) => s.id === id);
  if (!cs) return "Section not found.";
  if (sections.filter((s) => s.classGroup === cs.classGroup && s.shift === cs.shift).length === 1) {
    return "Every class needs at least one section.";
  }
  const studentCount = students.filter(
    (s) => s.classGroup === cs.classGroup && s.shift === cs.shift && s.section === cs.section,
  ).length;
  if (studentCount) return `${studentCount} student${studentCount === 1 ? " is" : "s are"} in this section. Move them first.`;
  if (users.some((u) => u.assignedSessions.some((a) => a.classSectionId === id))) return "Teachers are assigned to this section.";
  if (attendance.some((r) => r.classSectionId === id)) return "This section has saved attendance records.";
  return null;
}

export function deleteSection(id: string): void {
  const reason = sectionInUse(id);
  if (reason) throw new Error(reason);
  const cs = getSection(id)!;
  commit({ sections: getSections().filter((s) => s.id !== id) }, { category: "class", action: "Section deleted", summary: sectionLabel(cs) });
}

/** Saves a section's weekly timetable. Every subject must appear on exactly one day. */
export function saveSchedule(id: string, schedule: WeekSchedule): ClassSection {
  const cs = getSection(id);
  if (!cs) throw new Error("Section not found.");
  const days = groupDays(cs.classGroup);
  const issues = scheduleIssues(schedule, days, getSubjects());
  if (issues.length) throw new Error(issues[0]);
  const subjectOrder = getSubjects().map((s) => s.id);
  const clean: WeekSchedule = {};
  for (const d of days) clean[d] = subjectOrder.filter((sid) => schedule[d]?.includes(sid));
  const updated = { ...cs, schedule: clean };
  const names = (ids: string[]) => ids.map((sid) => getSubjects().find((x) => x.id === sid)?.name ?? "?").join(" + ");
  commit(
    { sections: getSections().map((s) => (s.id === id ? updated : s)) },
    {
      category: "class",
      action: "Timetable saved",
      summary: `${sectionLabel(cs)} — ${days.map((d) => `${d}: ${names(clean[d]) || "—"}`).join(", ")}`,
    },
  );
  return updated;
}

/** The class section a student belongs to. */
export function sectionOfStudent(student: Student, sections: ClassSection[] = getSections()): ClassSection | undefined {
  return sections.find(
    (s) => s.classGroup === student.classGroup && s.shift === student.shift && s.section === student.section,
  );
}

/* ---------- Students ---------- */

export function getStudents(): Student[] {
  return getData().students;
}

export function getStudent(id: string): Student | undefined {
  return getStudents().find((s) => s.id === id);
}

export function isPhoneTaken(phone: string, excludeId?: string): boolean {
  const p = normalizePhone(phone);
  return getStudents().some((s) => s.id !== excludeId && normalizePhone(s.phone) === p);
}

function cleanInput(input: StudentInput): StudentInput {
  if (!findSection(input.classGroup, input.shift, input.section)) {
    throw new Error(`Section ${input.section} does not exist for ${input.classGroup} · ${input.shift}.`);
  }
  return {
    ...input,
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    email: optStr(input.email),
    notes: optStr(input.notes),
  };
}

export function addStudent(input: StudentInput): Student {
  if (isPhoneTaken(input.phone)) throw new Error("Another student already uses this phone number.");
  const student: Student = { id: newId(), ...cleanInput(input) };
  commit({ students: [...getStudents(), student] }, { category: "student", action: "Student added", summary: studentSummary(student) });
  return student;
}

export function updateStudent(id: string, input: StudentInput): Student {
  if (isPhoneTaken(input.phone, id)) throw new Error("Another student already uses this phone number.");
  const student: Student = { id, ...cleanInput(input) };
  commit(
    { students: getStudents().map((s) => (s.id === id ? student : s)) },
    { category: "student", action: "Student edited", summary: studentSummary(student) },
  );
  return student;
}

const studentSummary = (s: Student) => `${s.fullName} · ${sectionShort(s)}`;

export interface DeletedStudent {
  student: Student;
  records: AttendanceRecord[];
}

/** Deletes the student and all of their attendance records; returns them for undo. */
export function deleteStudent(id: string): DeletedStudent {
  const student = getStudent(id);
  if (!student) throw new Error("Student not found.");
  const records = getAttendance().filter((r) => r.studentId === id);
  commit(
    {
      students: getStudents().filter((s) => s.id !== id),
      attendance: getAttendance().filter((r) => r.studentId !== id),
    },
    {
      category: "student",
      action: "Student deleted",
      summary: `${studentSummary(student)} · ${records.length} attendance record${records.length === 1 ? "" : "s"}`,
    },
  );
  return { student, records };
}

/** Undo for deleteStudent: puts the student and their records back. */
export function restoreStudent({ student, records }: DeletedStudent): void {
  if (getStudent(student.id)) return;
  if (isPhoneTaken(student.phone)) throw new Error("Another student now uses this phone number.");
  const existing = new Set(getAttendance().map((r) => r.id));
  commit(
    {
      students: [...getStudents(), student],
      attendance: [...getAttendance(), ...records.filter((r) => !existing.has(r.id))],
    },
    { category: "student", action: "Student restored", summary: studentSummary(student) },
  );
}

/** Adds many students in one write (CSV import). Every input must already be valid. */
export function addStudents(inputs: StudentInput[]): Student[] {
  const seen = new Set(getStudents().map((s) => normalizePhone(s.phone)));
  const created: Student[] = [];
  for (const input of inputs) {
    const phone = normalizePhone(input.phone);
    if (seen.has(phone)) throw new Error(`Duplicate phone number: ${input.phone}`);
    seen.add(phone);
    created.push({ id: newId(), ...cleanInput(input) });
  }
  if (created.length) {
    const first = created[0];
    commit(
      { students: [...getStudents(), ...created] },
      {
        category: "student",
        action: "Students imported",
        summary: `${created.length} student${created.length === 1 ? "" : "s"} from CSV into ${sectionShort(first)}`,
      },
    );
  }
  return created;
}

/* ---------- Attendance ---------- */

export function getAttendance(): AttendanceRecord[] {
  return getData().attendance;
}

export function getSessionRecords(date: string, classSectionId: string, subjectId: string): AttendanceRecord[] {
  return getAttendance().filter((r) => r.date === date && r.classSectionId === classSectionId && r.subjectId === subjectId);
}

/**
 * Saves one subject session's sheet. Records are unique per
 * (date, classSectionId, subjectId, studentId): existing ones are updated in
 * place, and entries with a null status remove any saved mark.
 */
export function saveSession(
  date: string,
  classSectionId: string,
  subjectId: string,
  entries: AttendanceEntry[],
  user: User,
): { saved: number; removed: number } {
  const cs = getSection(classSectionId);
  if (!cs) throw new Error("This class section no longer exists.");
  if (!canTakeAttendance(user, classSectionId, subjectId)) throw new Error("You are not assigned to this session.");
  if (!subjectsOn(cs, date).includes(subjectId)) throw new Error("This subject is not scheduled on that day.");

  const now = new Date().toISOString();
  const inSession = (r: AttendanceRecord) =>
    r.date === date && r.classSectionId === classSectionId && r.subjectId === subjectId;
  const byStudent = new Map(entries.map((e) => [e.studentId, e]));
  let saved = 0;
  let removed = 0;

  const next: AttendanceRecord[] = [];
  for (const r of getAttendance()) {
    const entry = inSession(r) ? byStudent.get(r.studentId) : undefined;
    if (!entry) {
      next.push(r);
      continue;
    }
    byStudent.delete(r.studentId);
    if (!entry.status) {
      removed++;
      continue;
    }
    const note = optStr(entry.note);
    if (r.status !== entry.status || r.note !== note) {
      next.push({ ...r, status: entry.status, note, recordedAt: now, recordedById: user.id, recordedByName: user.name });
    } else {
      next.push(r);
    }
    saved++;
  }
  for (const entry of byStudent.values()) {
    if (!entry.status) continue;
    next.push({
      id: newId(),
      date,
      classSectionId,
      subjectId,
      studentId: entry.studentId,
      status: entry.status,
      note: optStr(entry.note),
      recordedById: user.id,
      recordedByName: user.name,
      recordedAt: now,
    });
    saved++;
  }
  const c = countStatuses(next.filter(inSession));
  const subjectName = getSubjects().find((x) => x.id === subjectId)?.name ?? "Unknown subject";
  commit(
    { attendance: next },
    {
      category: "attendance",
      action: "Attendance saved",
      summary: `${subjectName} · ${sectionLabel(cs)} · ${date} — ${c.present} P, ${c.late} L, ${c.absent} A, ${c.excused} E`,
    },
  );
  return { saved, removed };
}

/* ---------- Whole-dataset operations ---------- */

export function exportBackup(): BackupFile {
  const { settings, subjects, sections, students, attendance } = getData();
  return { app: "institute-attendance", version: 2, exportedAt: new Date().toISOString(), settings, subjects, sections, students, attendance };
}

export interface ParsedBackup {
  data: AppData;
  /** Pre-upgrade records found in the file; they are archived on import. */
  legacyRecords: unknown[];
}

/** Validates an uploaded backup (v1 or v2) without saving it. Throws if it is not usable. */
export function parseBackup(raw: unknown): ParsedBackup {
  if (!isObj(raw)) throw new Error("This file is not a valid backup.");
  if (!Array.isArray(raw.students) || !Array.isArray(raw.attendance) || !raw.settings) {
    throw new Error("Backup is missing settings, students or attendance.");
  }
  const settings = cleanSettings(raw.settings);
  const sections = Array.isArray(raw.sections) ? cleanSections(raw.sections) : defaultSections(settings);
  const students = cleanStudents(raw.students);
  const studentIds = new Set(students.map((s) => s.id));
  const sectionIds = new Set(sections.map((s) => s.id));
  return {
    data: {
      settings,
      subjects: cleanSubjects(raw.subjects),
      sections,
      students,
      attendance: cleanAttendance(raw.attendance).filter((r) => studentIds.has(r.studentId) && sectionIds.has(r.classSectionId)),
    },
    legacyRecords: raw.attendance.filter(isLegacyRecord),
  };
}

export function replaceAllData(data: AppData, log?: LogInput): void {
  // Drop teacher assignments that point at sections/subjects which no longer exist.
  const sectionIds = new Set(data.sections.map((s) => s.id));
  const subjectIds = new Set(data.subjects.map((s) => s.id));
  const users = getUsers().map((u) => ({
    ...u,
    assignedSessions: u.assignedSessions.filter((a) => sectionIds.has(a.classSectionId) && subjectIds.has(a.subjectId)),
  }));
  commit({
    settings: data.settings,
    subjects: data.subjects,
    sections: data.sections,
    students: data.students,
    attendance: data.attendance,
    users,
  }, log);
}

export function importBackup(parsed: ParsedBackup): void {
  appendArchive(parsed.legacyRecords);
  replaceAllData(parsed.data, {
    category: "data",
    action: "Backup imported",
    summary: `${parsed.data.students.length} students, ${parsed.data.attendance.length} records`,
  });
}

/** Records that a backup was downloaded (drives the dashboard reminder). */
export function markBackupDownloaded(): void {
  commit(
    { flags: { ...getData().flags, lastBackupAt: new Date().toISOString(), backupSnoozedUntil: undefined } },
    { category: "data", action: "Backup downloaded", summary: "Full JSON backup" },
  );
}

/** Hides the dashboard backup reminder for a day. */
export function snoozeBackupReminder(): void {
  commit({ flags: { ...getData().flags, backupSnoozedUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString() } });
}

/** Erases institute data. User accounts, the session and the pre-upgrade archive are kept. */
export function eraseAllData(): void {
  try {
    DATA_KEYS.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    throw new Error("Could not erase data — browser storage is unavailable.");
  }
  cache = null;
  // Sections referenced by teachers no longer exist, so clear their assignments.
  const users = getUsers();
  commit(
    users.some((u) => u.assignedSessions.length) ? { users: users.map((u) => ({ ...u, assignedSessions: [] })) } : {},
    { category: "data", action: "All data erased", summary: "Students, attendance, subjects, sections and settings" },
  );
}

/* ---------- Flags & notices ---------- */

export function dismissUpgradeNotice(): void {
  commit({ flags: { ...getData().flags, upgradeNotice: null } });
}

/* ---------- Users & auth ---------- */
// Note: this is a local, single-browser lock. Passwords live in localStorage
// as typed; a real API must hash them and enforce permissions server-side.

export function getUsers(): User[] {
  return getData().users;
}

export function getUser(id: string): User | undefined {
  return getUsers().find((u) => u.id === id);
}

/** The signed-in user, or null if there is no valid session (or the account was deactivated). */
export function getCurrentUser(state: Pick<StoreState, "users" | "session"> = getData()): User | null {
  const { session, users } = state;
  if (!session) return null;
  return users.find((u) => u.id === session.userId && u.active) ?? null;
}

export function canTakeAttendance(user: User, classSectionId: string, subjectId: string): boolean {
  if (user.role === "principal") return true;
  return user.assignedSessions.some((a) => a.classSectionId === classSectionId && a.subjectId === subjectId);
}

/** Active teachers assigned to a subject session. */
export function teachersFor(users: User[], classSectionId: string, subjectId: string): User[] {
  return users.filter(
    (u) => u.role === "teacher" && u.active && u.assignedSessions.some((a) => a.classSectionId === classSectionId && a.subjectId === subjectId),
  );
}

export function isUsernameTaken(username: string, excludeId?: string): boolean {
  const u = username.trim().toLowerCase();
  return getUsers().some((x) => x.id !== excludeId && x.username.toLowerCase() === u);
}

/** Signs in and stores the session in "iap.session". Throws with a user-facing message. */
export function login(username: string, password: string): User {
  const user = getUsers().find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user || user.password !== password) throw new Error("Incorrect username or password.");
  if (!user.active) throw new Error("This account has been deactivated. Contact your principal.");

  // One-time reminder the first time someone signs in with the seeded password.
  const { flags } = getData();
  const showDefault = user.id === DEFAULT_PRINCIPAL_ID && user.password === DEFAULT_PRINCIPAL_PASSWORD && !flags.defaultPasswordNotice;
  commit(
    {
      session: { userId: user.id, loggedInAt: new Date().toISOString(), notice: showDefault ? "default-password" : undefined },
      ...(showDefault ? { flags: { ...flags, defaultPasswordNotice: true } } : {}),
    },
    { category: "auth", action: "Signed in", summary: `@${user.username} (${user.role})`, actor: user },
  );
  return user;
}

export function logout(): void {
  const user = getCurrentUser();
  commit({ session: null }, user ? { category: "auth", action: "Signed out", summary: `@${user.username}`, actor: user } : undefined);
}

export function dismissSessionNotice(): void {
  const { session } = getData();
  if (session?.notice) commit({ session: { ...session, notice: undefined } });
}

function cleanTeacherInput(input: TeacherInput) {
  return {
    name: input.name.trim(),
    username: input.username.trim(),
    assignedSessions: cleanSessionRefs(input.assignedSessions),
  };
}

export function addTeacher(input: TeacherInput): User {
  if (isUsernameTaken(input.username)) throw new Error("This username is already taken.");
  if (!input.password || input.password.length < 4) throw new Error("Password must be at least 4 characters.");
  const user: User = {
    id: newId(),
    ...cleanTeacherInput(input),
    password: input.password,
    role: "teacher",
    active: true,
    createdAt: new Date().toISOString(),
  };
  commit(
    { users: [...getUsers(), user] },
    { category: "teacher", action: "Teacher created", summary: `${user.name} (@${user.username}) · ${user.assignedSessions.length} sessions` },
  );
  return user;
}

function updateUser(id: string, fn: (u: User) => User, log?: (u: User) => Omit<LogInput, "category">): User {
  const existing = getUser(id);
  if (!existing) throw new Error("User not found.");
  const updated = fn(existing);
  commit({ users: getUsers().map((u) => (u.id === id ? updated : u)) }, log ? { category: "teacher", ...log(updated) } : undefined);
  return updated;
}

export function updateTeacher(id: string, input: TeacherInput): User {
  if (isUsernameTaken(input.username, id)) throw new Error("This username is already taken.");
  return updateUser(
    id,
    (u) => ({ ...u, ...cleanTeacherInput(input) }),
    (u) => ({ action: "Teacher edited", summary: `${u.name} (@${u.username}) · ${u.assignedSessions.length} sessions` }),
  );
}

export function setUserActive(id: string, active: boolean): User {
  if (getUser(id)?.role === "principal") throw new Error("Principal accounts cannot be deactivated.");
  return updateUser(
    id,
    (u) => ({ ...u, active }),
    (u) => ({ action: active ? "Teacher activated" : "Teacher deactivated", summary: `${u.name} (@${u.username})` }),
  );
}

export function resetPassword(id: string, password: string): User {
  if (password.length < 4) throw new Error("Password must be at least 4 characters.");
  return updateUser(
    id,
    (u) => ({ ...u, password }),
    (u) => ({ action: "Password reset", summary: `${u.name} (@${u.username})` }),
  );
}

export function changeOwnPassword(userId: string, current: string, next: string): User {
  const user = getUser(userId);
  if (!user || user.password !== current) throw new Error("Current password is incorrect.");
  if (next.length < 4) throw new Error("New password must be at least 4 characters.");
  if (next === current) throw new Error("New password must be different from the current one.");
  return updateUser(
    userId,
    (u) => ({ ...u, password: next }),
    (u) => ({ action: "Own password changed", summary: `@${u.username}` }),
  );
}

/** Deletes a teacher and returns the account for undo. Past attendance keeps the recorder name snapshot. */
export function deleteTeacher(id: string): User {
  const user = getUser(id);
  if (!user) throw new Error("User not found.");
  if (user.role === "principal") throw new Error("Principal accounts cannot be deleted.");
  commit(
    { users: getUsers().filter((u) => u.id !== id) },
    { category: "teacher", action: "Teacher deleted", summary: `${user.name} (@${user.username})` },
  );
  return user;
}

/** Undo for deleteTeacher. Assignments to sections that no longer exist are dropped. */
export function restoreTeacher(user: User): void {
  if (getUser(user.id)) return;
  if (isUsernameTaken(user.username)) throw new Error(`The username @${user.username} has been taken.`);
  const sectionIds = new Set(getSections().map((s) => s.id));
  const restored = { ...user, assignedSessions: user.assignedSessions.filter((a) => sectionIds.has(a.classSectionId)) };
  commit({ users: [...getUsers(), restored] }, { category: "teacher", action: "Teacher restored", summary: `${user.name} (@${user.username})` });
}

/**
 * Adds demo teacher accounts. A teacher whose username already exists keeps
 * their id and password but gets the demo name and assignments.
 * Returns the saved users in input order.
 */
export function upsertTeachers(teachers: User[]): User[] {
  const users = [...getUsers()];
  const result = teachers.map((t) => {
    const i = users.findIndex((u) => u.username.toLowerCase() === t.username.toLowerCase());
    if (i === -1) {
      users.push(t);
      return t;
    }
    if (users[i].role === "principal") return users[i];
    users[i] = { ...users[i], name: t.name, assignedSessions: t.assignedSessions };
    return users[i];
  });
  commit({ users });
  return result;
}
