"use client";

import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { exportAttendanceCSV } from "@/lib/actions";
import { useAppData, useCurrentUser } from "@/lib/hooks";
import type { AttendanceRecord, ClassSection, Settings, StatusCounts, Student, Subject } from "@/lib/types";
import {
  STATUSES,
  STATUS_META,
  addDays,
  attendanceRate,
  cn,
  countStatuses,
  formatDate,
  formatDateTime,
  formatRate,
  formatWeekday,
  rateColor,
  sectionLabel,
  sectionShort,
  todayISO,
} from "@/lib/utils";
import { SkeletonRows } from "../Polish";
import { sortSections } from "../TeacherModals";
import { useToast } from "../Toast";
import { ArrowRightIcon, ChartIcon, ClipboardIcon, DownloadIcon, FilterIcon, PrinterIcon } from "../icons";
import { Button, ButtonLink, Card, CardHeader, EmptyState, Field, PageLoading, RateBar, Select, StatusBadge, inputClass } from "../ui";

type Range = { from: string; to: string };
type SortKey = "name" | "rate-asc" | "rate-desc";
const PAGE_SIZE = 50;
const emptyCounts = (): StatusCounts => ({ present: 0, late: 0, absent: 0, excused: 0, total: 0 });

export function ReportsView() {
  const { settings, students, attendance, users, sections, subjects, ready } = useAppData();
  const toast = useToast();
  const today = ready ? todayISO() : "";

  const [range, setRange] = useState<Range | null>(null);
  const [group, setGroup] = useState("all");
  const [shift, setShift] = useState("all");
  const [sectionId, setSectionId] = useState("all");
  const [subjectId, setSubjectId] = useState("all");
  const [recorder, setRecorder] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [previewing, setPreviewing] = useState(false);
  // The print sheet holds every record, so it is only rendered while printing (or in Print view).
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const { user } = useCurrentUser();

  // Default range: last 30 days (computed on the client, where "today" is known).
  const { from, to } = range ?? { from: today ? addDays(today, -29) : "", to: today };

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Unknown subject";
  const sectionName = (id: string) => {
    const cs = sectionById.get(id);
    return cs ? sectionShort(cs) : "Removed section";
  };

  const filterKey = JSON.stringify({ from, to, group, shift, sectionId, subjectId, recorder });
  const deferredKey = useDeferredValue(filterKey);
  const filtering = filterKey !== deferredKey;

  const records = useMemo(
    () => {
      const d = JSON.parse(deferredKey) as Record<"from" | "to" | "group" | "shift" | "sectionId" | "subjectId" | "recorder", string>;
      return attendance
        .filter((r) => {
          if (r.date < d.from || r.date > d.to || !studentById.has(r.studentId)) return false;
          const cs = sectionById.get(r.classSectionId);
          if (d.group !== "all" && cs?.classGroup !== d.group) return false;
          if (d.shift !== "all" && cs?.shift !== d.shift) return false;
          if (d.sectionId !== "all" && r.classSectionId !== d.sectionId) return false;
          if (d.subjectId !== "all" && r.subjectId !== d.subjectId) return false;
          if (d.recorder !== "all" && r.recordedById !== d.recorder) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt));
    },
    [attendance, deferredKey, studentById, sectionById],
  );
  const totals = countStatuses(records);
  const totalRate = attendanceRate(totals);

  const summarySubjects = subjects.filter((s) => (subjectId === "all" || s.id === subjectId) && records.some((r) => r.subjectId === s.id));

  const perStudent = useMemo(() => {
    const map = new Map<string, { student: Student; counts: StatusCounts; bySubject: Map<string, StatusCounts> }>();
    for (const r of records) {
      const student = studentById.get(r.studentId)!;
      const row = map.get(r.studentId) ?? { student, counts: emptyCounts(), bySubject: new Map() };
      const sub = row.bySubject.get(r.subjectId) ?? emptyCounts();
      row.counts[r.status]++;
      row.counts.total++;
      sub[r.status]++;
      sub.total++;
      row.bySubject.set(r.subjectId, sub);
      map.set(r.studentId, row);
    }
    const rows = [...map.values()].map((r) => ({ ...r, rate: attendanceRate(r.counts) }));
    return rows.sort((a, b) => {
      if (sort === "name") return a.student.fullName.localeCompare(b.student.fullName);
      const ra = a.rate ?? -1;
      const rb = b.rate ?? -1;
      return sort === "rate-asc" ? ra - rb : rb - ra;
    });
  }, [records, studentById, sort]);

  if (!ready) return <PageLoading />;

  function updateRange(next: Range) {
    // Keep the range valid if the user picks an end date before the start.
    setRange(next.from > next.to ? { from: next.to, to: next.from } : next);
    setLimit(PAGE_SIZE);
  }

  const firstDate = attendance.reduce((min, r) => (r.date < min ? r.date : min), today);
  const presets: { label: string; range: Range }[] = [
    { label: "Today", range: { from: today, to: today } },
    { label: "Last 7 days", range: { from: addDays(today, -6), to: today } },
    { label: "Last 30 days", range: { from: addDays(today, -29), to: today } },
    { label: "This month", range: { from: `${today.slice(0, 8)}01`, to: today } },
    { label: "All time", range: { from: firstDate, to: today } },
  ];

  const sortedSections = sortSections(sections);
  const groupOptions = [...new Set([...settings.classGroups, ...sections.map((s) => s.classGroup)])];
  const shiftOptions = [...new Set([...settings.shifts, ...sections.map((s) => s.shift)])];
  const sectionOptions = sortedSections.filter(
    (s: ClassSection) => (group === "all" || s.classGroup === group) && (shift === "all" || s.shift === shift),
  );

  // Every account, plus recorders that were since deleted (their name lives on in the records).
  const recorderOptions = new Map<string, string>();
  for (const u of [...users].sort((a, b) => a.name.localeCompare(b.name))) {
    recorderOptions.set(u.id, u.role === "principal" ? `${u.name} (principal)` : u.name);
  }
  for (const r of attendance) {
    if (!recorderOptions.has(r.recordedById)) recorderOptions.set(r.recordedById, `${r.recordedByName} (deleted)`);
  }

  const resetPage = () => setLimit(PAGE_SIZE);

  function exportCSV() {
    if (records.length === 0) return;
    const filename = exportAttendanceCSV(records, `attendance_${from}_to_${to}.csv`);
    toast.success("CSV exported", `${records.length} records · ${filename}`);
  }

  function printReport() {
    window.print();
  }

  function clearFilters() {
    setGroup("all");
    setShift("all");
    setSectionId("all");
    setSubjectId("all");
    setRecorder("all");
    updateRange(presets[4].range);
  }

  const filterLabel = [
    sectionId !== "all"
      ? sectionName(sectionId)
      : [group === "all" ? "All class groups" : group, shift === "all" ? "All shifts" : shift].join(" · "),
    subjectId === "all" ? "All subjects" : subjectName(subjectId),
    ...(recorder === "all" ? [] : [`recorded by ${recorderOptions.get(recorder) ?? "unknown"}`]),
  ].join(" · ");

  const sheet = (
    <PrintSheet
      settings={settings}
      from={from}
      to={to}
      filterLabel={filterLabel}
      generatedBy={user?.name ?? ""}
      totals={totals}
      rate={totalRate}
      subjects={summarySubjects}
      perStudent={perStudent}
      records={records}
      studentName={(id) => studentById.get(id)?.fullName ?? ""}
      sectionName={sectionName}
      subjectName={subjectName}
    />
  );

  if (previewing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="secondary" onClick={() => setPreviewing(false)}>
            <ArrowRightIcon width={16} height={16} className="rotate-180" /> Back to report
          </Button>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-slate-500 sm:block">This is exactly what prints — black on white, no navigation.</p>
            <Button onClick={printReport} disabled={records.length === 0}>
              <PrinterIcon width={16} height={16} /> Print
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-[14px] border border-slate-200 bg-slate-100 p-3 sm:p-6 print:border-0 print:bg-transparent print:p-0">
          <div className="mx-auto min-w-[640px] max-w-[900px] rounded bg-[#fff] p-6 text-[#111] shadow-md sm:p-10 print:min-w-0 print:p-0 print:shadow-none">
            {sheet}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Printing from the normal view uses the same clean sheet. */}
      {printing && <div className="hidden print:block">{sheet}</div>}

      <Card className="p-4 sm:p-5 print:hidden">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From" htmlFor="rp-from">
            <input
              id="rp-from"
              type="date"
              className={inputClass}
              value={from}
              max={today}
              onChange={(e) => e.target.value && updateRange({ from: e.target.value, to })}
            />
          </Field>
          <Field label="To" htmlFor="rp-to">
            <input
              id="rp-to"
              type="date"
              className={inputClass}
              value={to}
              max={today}
              onChange={(e) => e.target.value && updateRange({ from, to: e.target.value })}
            />
          </Field>
          <Field label="Class group" htmlFor="rp-group">
            <Select
              id="rp-group"
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setSectionId("all");
                resetPage();
              }}
              options={[{ value: "all", label: "All class groups" }, ...groupOptions.map((g) => ({ value: g, label: g }))]}
            />
          </Field>
          <Field label="Shift" htmlFor="rp-shift">
            <Select
              id="rp-shift"
              value={shift}
              onChange={(e) => {
                setShift(e.target.value);
                setSectionId("all");
                resetPage();
              }}
              options={[{ value: "all", label: "All shifts" }, ...shiftOptions.map((s) => ({ value: s, label: s }))]}
            />
          </Field>
          <Field label="Section" htmlFor="rp-section">
            <Select
              id="rp-section"
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                resetPage();
              }}
              options={[{ value: "all", label: "All sections" }, ...sectionOptions.map((s) => ({ value: s.id, label: sectionLabel(s) }))]}
            />
          </Field>
          <Field label="Subject" htmlFor="rp-subject">
            <Select
              id="rp-subject"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                resetPage();
              }}
              options={[{ value: "all", label: "All subjects" }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </Field>
          <Field label="Recorded by" htmlFor="rp-recorder" className="sm:col-span-2">
            <Select
              id="rp-recorder"
              value={recorder}
              onChange={(e) => {
                setRecorder(e.target.value);
                resetPage();
              }}
              options={[{ value: "all", label: "All" }, ...[...recorderOptions].map(([value, label]) => ({ value, label }))]}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const active = p.range.from === from && p.range.to === to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => updateRange(p.range)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPreviewing(true)} disabled={records.length === 0}>
              <PrinterIcon width={16} height={16} /> Print view
            </Button>
            <Button onClick={exportCSV} disabled={records.length === 0}>
              <DownloadIcon width={16} height={16} /> Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {filtering ? (
        <Card className="print:hidden">
          <SkeletonRows rows={6} columns={6} />
        </Card>
      ) : attendance.length === 0 ? (
        <Card>
          <EmptyState
            className="py-16"
            icon={<ChartIcon />}
            title="No attendance recorded yet"
            hint="Reports are built from saved subject sessions. Take attendance for a session to get started."
            action={
              <ButtonLink href="/attendance">
                <ClipboardIcon width={16} height={16} /> Take attendance
              </ButtonLink>
            }
          />
        </Card>
      ) : records.length === 0 ? (
        <Card>
          <EmptyState
            className="py-16"
            icon={<FilterIcon />}
            title="No records match these filters"
            hint={`Nothing between ${formatDate(from)} and ${formatDate(to)} for ${filterLabel.toLowerCase()}.`}
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear all filters
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4 print:hidden">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryChip label="Total records" value={totals.total} />
            {STATUSES.map((s) => (
              <SummaryChip key={s} label={STATUS_META[s].label} value={totals[s]} dot={STATUS_META[s].bar} />
            ))}
            <SummaryChip label="Attendance rate" value={<span className={rateColor(totalRate)}>{formatRate(totalRate)}</span>} />
          </div>

          <Card>
            <CardHeader
              title="Per-student summary"
              subtitle={`${perStudent.length} students · per subject: rate and P·L·A·E counts · rate = (Present + Late) ÷ (Present + Late + Absent)`}
              actions={
                <Select
                  aria-label="Sort students"
                  className="h-8 w-auto text-xs print:hidden"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  options={[
                    { value: "name", label: "Sort: Name" },
                    { value: "rate-asc", label: "Sort: Lowest rate" },
                    { value: "rate-desc", label: "Sort: Highest rate" },
                  ]}
                />
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Section</th>
                    {summarySubjects.map((s) => (
                      <th key={s.id} className="px-3 py-3 font-medium">
                        {s.name}
                      </th>
                    ))}
                    <th className="w-44 px-4 py-3 font-medium">Overall</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {perStudent.map(({ student, counts, bySubject, rate }) => (
                    <tr key={student.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{student.fullName}</p>
                        <p className="text-xs text-slate-400 tabular-nums">{student.phone}</p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                        {student.classGroup} {student.shift} · {student.section}
                      </td>
                      {summarySubjects.map((sub) => {
                        const c = bySubject.get(sub.id);
                        const r = c ? attendanceRate(c) : null;
                        return (
                          <td key={sub.id} className="px-3 py-2.5 whitespace-nowrap">
                            {c ? (
                              <>
                                <span className={cn("block text-sm font-semibold tabular-nums", rateColor(r))}>{formatRate(r)}</span>
                                <span className="block text-[11px] text-slate-400 tabular-nums" title="Present · Late · Absent · Excused">
                                  {c.present}·{c.late}·{c.absent}·{c.excused}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <RateBar rate={rate} />
                          </div>
                          <span className={cn("w-10 text-right text-xs font-semibold tabular-nums", rateColor(rate))}>{formatRate(rate)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400 tabular-nums">{counts.total} marks</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="Detailed records" subtitle={`${records.length} records, newest first`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Section</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 font-medium">Recorded by</th>
                    <th className="px-4 py-3 font-medium">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.slice(0, limit).map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-slate-900">{formatDate(r.date)}</span>{" "}
                        <span className="text-xs text-slate-400">{formatWeekday(r.date)}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{studentById.get(r.studentId)?.fullName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{sectionName(r.classSectionId)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{subjectName(r.subjectId)}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-slate-500">{r.note || "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{r.recordedByName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-400">{formatDateTime(r.recordedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {records.length > limit && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 print:hidden">
                <p className="text-xs text-slate-400">
                  Showing {limit} of {records.length}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setLimit(limit + PAGE_SIZE)}>
                    Show {Math.min(PAGE_SIZE, records.length - limit)} more
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setLimit(records.length)}>
                    Show all
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

/** Print-optimised report: institute header, range, summary, then tables. Black on white. */
function PrintSheet({
  settings,
  from,
  to,
  filterLabel,
  generatedBy,
  totals,
  rate,
  subjects,
  perStudent,
  records,
  studentName,
  sectionName,
  subjectName,
}: {
  settings: Settings;
  from: string;
  to: string;
  filterLabel: string;
  generatedBy: string;
  totals: StatusCounts;
  rate: number | null;
  subjects: Subject[];
  perStudent: { student: Student; counts: StatusCounts; bySubject: Map<string, StatusCounts>; rate: number | null }[];
  records: AttendanceRecord[];
  studentName: (id: string) => string;
  sectionName: (id: string) => string;
  subjectName: (id: string) => string;
}) {
  const cell = "border border-[#bbb] px-2 py-1 text-left align-top";
  const chips: [string, string | number][] = [
    ["Total records", totals.total],
    ...STATUSES.map((s): [string, number] => [STATUS_META[s].label, totals[s]]),
    ["Attendance rate", formatRate(rate)],
  ];
  return (
    <article className="print-sheet text-[12px] leading-snug text-[#111]">
      <header className="flex items-center gap-4 border-b-2 border-[#111] pb-3">
        <span className="text-4xl">{settings.logoEmoji}</span>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{settings.instituteName}</h1>
          <p className="text-sm">Attendance report</p>
        </div>
        <div className="text-right text-[11px]">
          <p className="font-semibold">
            {formatDate(from)} – {formatDate(to)}
          </p>
          <p>{filterLabel}</p>
          <p>
            Generated {formatDateTime(new Date().toISOString())}
            {generatedBy && ` by ${generatedBy}`}
          </p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-6 gap-2">
        {chips.map(([label, value]) => (
          <div key={label} className="rounded border border-[#bbb] px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide">{label}</p>
            <p className="text-base font-bold">{value}</p>
          </div>
        ))}
      </section>

      <h2 className="mt-5 mb-1.5 text-sm font-bold">Per-student summary</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cell}>Student</th>
            <th className={cell}>Section</th>
            {subjects.map((s) => (
              <th key={s.id} className={cell}>
                {s.name}
              </th>
            ))}
            <th className={cell}>Overall</th>
            <th className={cell}>Marks</th>
          </tr>
        </thead>
        <tbody>
          {perStudent.map(({ student, counts, bySubject, rate: r }) => (
            <tr key={student.id}>
              <td className={cell}>{student.fullName}</td>
              <td className={cell}>{sectionShort(student)}</td>
              {subjects.map((sub) => {
                const c = bySubject.get(sub.id);
                return (
                  <td key={sub.id} className={cell}>
                    {c ? `${formatRate(attendanceRate(c))} (${c.present}/${c.late}/${c.absent}/${c.excused})` : "—"}
                  </td>
                );
              })}
              <td className={cn(cell, "font-semibold")}>{formatRate(r)}</td>
              <td className={cell}>{counts.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px]">Per subject: rate (Present/Late/Absent/Excused). Rate = (Present + Late) ÷ (Present + Late + Absent).</p>

      <h2 className="mt-5 mb-1.5 text-sm font-bold">Detailed records ({records.length})</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Date", "Student", "Section", "Subject", "Status", "Note", "Recorded by"].map((h) => (
              <th key={h} className={cell}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td className={cn(cell, "whitespace-nowrap")}>{formatDate(r.date)}</td>
              <td className={cell}>{studentName(r.studentId)}</td>
              <td className={cell}>{sectionName(r.classSectionId)}</td>
              <td className={cell}>{subjectName(r.subjectId)}</td>
              <td className={cell}>{STATUS_META[r.status].label}</td>
              <td className={cell}>{r.note ?? ""}</td>
              <td className={cell}>{r.recordedByName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function SummaryChip({ label, value, dot }: { label: string; value: ReactNode; dot?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {dot && <span className={cn("h-2 w-2 rounded-full", dot)} />}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
    </Card>
  );
}
