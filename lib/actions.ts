"use client";

// Browser-side actions shared by pages and the command palette.

import { exportBackup, getData, logActivity, markBackupDownloaded } from "./storage";
import type { AttendanceRecord } from "./types";
import { STATUS_META, downloadFile, formatWeekday, toCSV, todayISO } from "./utils";

/** Downloads a full JSON backup and remembers when it happened. */
export function downloadBackup(): string {
  const name = `iap-backup-${todayISO()}.json`;
  downloadFile(name, JSON.stringify(exportBackup(), null, 2), "application/json");
  markBackupDownloaded();
  return name;
}

export const CSV_HEADER = [
  "Date",
  "Weekday",
  "Student",
  "Phone",
  "Class group",
  "Shift",
  "Section",
  "Subject",
  "Status",
  "Note",
  "Recorded by",
  "Recorded at",
];

/** Downloads attendance records as CSV (one row per mark). Returns the file name. */
export function exportAttendanceCSV(records: AttendanceRecord[], filename: string): string {
  const { students, sections, subjects } = getData();
  const rows: unknown[][] = [
    CSV_HEADER,
    ...records.flatMap((r) => {
      const s = students.find((x) => x.id === r.studentId);
      if (!s) return [];
      const cs = sections.find((x) => x.id === r.classSectionId);
      return [
        [
          r.date,
          formatWeekday(r.date),
          s.fullName,
          s.phone,
          cs?.classGroup ?? "",
          cs?.shift ?? "",
          cs?.section ?? "",
          subjects.find((x) => x.id === r.subjectId)?.name ?? "Unknown subject",
          STATUS_META[r.status].label,
          r.note ?? "",
          r.recordedByName,
          r.recordedAt,
        ],
      ];
    }),
  ];
  downloadFile(filename, toCSV(rows), "text/csv;charset=utf-8");
  logActivity({ category: "data", action: "CSV exported", summary: `${rows.length - 1} records · ${filename}` });
  return filename;
}
