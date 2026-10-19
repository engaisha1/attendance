"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/hooks";
import { sectionOfStudent } from "@/lib/storage";
import type { AttendanceStatus } from "@/lib/types";
import {
  STATUSES,
  STATUS_META,
  attendanceRate,
  cn,
  countStatuses,
  formatDate,
  formatRate,
  formatWeekday,
  rateColor,
  sectionShort,
} from "@/lib/utils";
import { CertificateModal } from "./Certificate";
import { Modal } from "./Modal";
import { AwardIcon, ClipboardIcon, PencilIcon, TrashIcon } from "./icons";
import { Button, ButtonLink, EmptyState, RateBar, StatusBadge, StudentStatusBadge } from "./ui";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

interface Props {
  studentId: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function StudentProfile({ studentId, onClose, onEdit, onDelete }: Props) {
  const { students, attendance, subjects, sections } = useAppData();
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Unknown subject";
  const sectionName = (id: string) => {
    const cs = sections.find((s) => s.id === id);
    return cs ? sectionShort(cs) : "Removed section";
  };
  const student = students.find((s) => s.id === studentId);
  const [filter, setFilter] = useState<AttendanceStatus | "all">("all");
  const [certificate, setCertificate] = useState(false);

  const history = useMemo(
    () =>
      attendance
        .filter((r) => r.studentId === studentId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt)),
    [attendance, studentId],
  );
  const counts = countStatuses(history);
  const rate = attendanceRate(counts);
  const shown = filter === "all" ? history : history.filter((r) => r.status === filter);

  if (!student) return null;
  // The certificate replaces the profile panel while open (one dialog at a time).
  if (certificate) return <CertificateModal student={student} onClose={() => setCertificate(false)} />;
  const ownSection = sectionOfStudent(student, sections);
  const perSubject = subjects
    .map((sub) => ({ sub, rate: attendanceRate(countStatuses(history.filter((r) => r.subjectId === sub.id))) }))
    .filter((x) => x.rate !== null);

  return (
    <Modal
      open
      variant="panel"
      onClose={onClose}
      title="Student profile"
      footer={
        <>
          <Button variant="ghost" onClick={onDelete} className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700">
            <TrashIcon width={16} height={16} /> Delete
          </Button>
          <ButtonLink
            variant="secondary"
            href={ownSection ? `/attendance?section=${ownSection.id}` : "/attendance"}
          >
            <ClipboardIcon width={16} height={16} /> Take attendance
          </ButtonLink>
          <Button variant="secondary" onClick={() => setCertificate(true)}>
            <AwardIcon width={16} height={16} /> Attendance Certificate
          </Button>
          <Button onClick={onEdit}>
            <PencilIcon width={16} height={16} /> Edit
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-semibold text-white">
          {initials(student.fullName)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-slate-900">{student.fullName}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <StudentStatusBadge status={student.status} />
            <span>
              {student.classGroup} · {student.shift} · Section {student.section}
            </span>
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-400">Phone</dt>
          <dd className="font-medium text-slate-800">{student.phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Email</dt>
          <dd className="truncate font-medium text-slate-800">
            {student.email ? (
              <a href={`mailto:${student.email}`} className="text-indigo-600 hover:underline">
                {student.email}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Joined</dt>
          <dd className="font-medium text-slate-800">{formatDate(student.joinedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Records</dt>
          <dd className="font-medium text-slate-800">{counts.total}</dd>
        </div>
        {student.notes && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-400">Notes</dt>
            <dd className="whitespace-pre-wrap text-slate-700">{student.notes}</dd>
          </div>
        )}
      </dl>

      <div className="mt-5 rounded-xl border border-slate-100 p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">Attendance rate</p>
            <p className={cn("text-3xl font-semibold tabular-nums", rateColor(rate))}>{formatRate(rate)}</p>
          </div>
          <p className="text-right text-xs text-slate-400">Present + Late over all
            <br />non-excused marks</p>
        </div>
        <div className="mt-3">
          <RateBar rate={rate} />
        </div>
        {perSubject.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {perSubject.map(({ sub, rate: r }) => (
              <li key={sub.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="truncate text-xs text-slate-500">{sub.name}</p>
                <p className={cn("text-sm font-semibold tabular-nums", rateColor(r))}>{formatRate(r)}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(filter === s ? "all" : s)}
              aria-pressed={filter === s}
              className={cn(
                "rounded-lg border px-2 py-2 text-center transition",
                filter === s ? "border-indigo-300 bg-indigo-50" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50",
              )}
            >
              <span className="block text-lg font-semibold text-slate-900 tabular-nums">{counts[s]}</span>
              <span className="block text-xs text-slate-500">{STATUS_META[s].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Attendance history</h4>
          {filter !== "all" && (
            <button type="button" onClick={() => setFilter("all")} className="text-xs font-medium text-indigo-600 hover:underline">
              Show all
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <EmptyState
            className="rounded-xl border border-dashed border-slate-200 py-8"
            icon={<ClipboardIcon />}
            title={history.length === 0 ? "No attendance yet" : "No records with this status"}
            hint={
              history.length === 0
                ? "Marks appear here once attendance is saved for this student's class."
                : "Pick another status above or show all records."
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <div className="w-24 shrink-0">
                  <p className="font-medium text-slate-800">{formatDate(r.date)}</p>
                  <p className="text-xs text-slate-400">{formatWeekday(r.date)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{subjectName(r.subjectId)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {sectionName(r.classSectionId)} · by {r.recordedByName}
                  </p>
                  {r.note && <p className="truncate text-xs text-slate-600 italic">“{r.note}”</p>}
                </div>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
