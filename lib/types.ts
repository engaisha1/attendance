export type StudentStatus = "active" | "inactive";
export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type Role = "principal" | "teacher";

export interface Settings {
  instituteName: string;
  logoEmoji: string;
  classGroups: string[];
  shifts: string[];
}

export interface Subject {
  id: string;
  name: string;
}

/** Day abbreviation ("Sat", "Sun", …) → subject ids taught that day, in order. */
export type WeekSchedule = Record<string, string[]>;

/** A class is classGroup + shift + section, e.g. "Sat-Sun · PM · Section A". */
export interface ClassSection {
  id: string;
  classGroup: string;
  shift: string;
  /** Section name, e.g. "A". */
  section: string;
  schedule: WeekSchedule;
}

export interface Student {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  classGroup: string;
  shift: string;
  /** Section name within classGroup + shift, e.g. "A". */
  section: string;
  status: StudentStatus;
  /** YYYY-MM-DD */
  joinedAt: string;
  notes?: string;
}

/** Fields the user edits; id is assigned by the data layer. */
export type StudentInput = Omit<Student, "id">;

/** One subject lesson for one class section. */
export interface SessionRef {
  classSectionId: string;
  subjectId: string;
}

/** One mark for one student in one subject session. Unique per (date, classSectionId, subjectId, studentId). */
export interface AttendanceRecord {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  classSectionId: string;
  subjectId: string;
  studentId: string;
  status: AttendanceStatus;
  note?: string;
  recordedById: string;
  /** Snapshot so the name survives the user being deleted. */
  recordedByName: string;
  /** ISO timestamp */
  recordedAt: string;
}

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  /** Subject sessions this teacher may take attendance for. Empty for principals. */
  assignedSessions: SessionRef[];
  active: boolean;
  /** ISO timestamp */
  createdAt: string;
}

/** Fields edited in the teacher form; password is set separately when editing. */
export interface TeacherInput {
  name: string;
  username: string;
  password?: string;
  assignedSessions: SessionRef[];
}

export interface Session {
  userId: string;
  /** ISO timestamp */
  loggedInAt: string;
  /** One-time notice to show after this login. */
  notice?: "default-password";
}

/** Persistent one-time flags ("iap.flags"). */
export interface Flags {
  defaultPasswordNotice?: boolean;
  /** Set by the subjects/sections upgrade until the principal dismisses it. */
  upgradeNotice?: { archivedRecords: number; resetTeachers: number } | null;
  /** ISO timestamp of the last downloaded JSON backup. */
  lastBackupAt?: string;
  /** ISO timestamp until which the dashboard backup reminder is hidden. */
  backupSnoozedUntil?: string;
}

export type ActivityCategory = "student" | "attendance" | "teacher" | "class" | "settings" | "data" | "auth";

/** One line in the principal's activity log ("iap.activity"), newest first. */
export interface ActivityEntry {
  id: string;
  /** ISO timestamp */
  at: string;
  actorId: string;
  actorName: string;
  category: ActivityCategory;
  /** Short label, e.g. "Student added". */
  action: string;
  /** Human-readable details, e.g. "Amina Hassan · Sat-Sun PM · A". */
  summary: string;
}

/** One student's mark in an attendance sheet; null status = not marked. */
export interface AttendanceEntry {
  studentId: string;
  status: AttendanceStatus | null;
  note: string;
}

export interface AppData {
  settings: Settings;
  subjects: Subject[];
  sections: ClassSection[];
  students: Student[];
  attendance: AttendanceRecord[];
}

/** Everything the store holds: institute data plus accounts, the login session and flags. */
export interface StoreState extends AppData {
  users: User[];
  session: Session | null;
  flags: Flags;
  activity: ActivityEntry[];
}

/** Backups cover institute data only; user accounts and sessions are not exported. */
export interface BackupFile extends AppData {
  app: "institute-attendance";
  version: 2;
  exportedAt: string;
}

export interface StatusCounts {
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
}
