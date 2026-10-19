"use client";

import { useMemo, useState, type ReactNode } from "react";
import { downloadBackup } from "@/lib/actions";
import { loadDemoData } from "@/lib/demo";
import { useAppData } from "@/lib/hooks";
import { snoozeBackupReminder, teachersFor } from "@/lib/storage";
import type { AttendanceRecord } from "@/lib/types";
import {
  STATUSES,
  STATUS_META,
  WEEK_ORDER,
  addDays,
  attendanceRate,
  cn,
  countStatuses,
  dayAbbr,
  dayName,
  formatDate,
  formatRate,
  formatWeekday,
  groupDays,
  hasTimetable,
  rateColor,
  relativeTime,
  sectionShort,
  sessionKey,
  subjectsOn,
  todayISO,
} from "@/lib/utils";
import { CountUp } from "../Polish";
import { StudentFormModal } from "../StudentFormModal";
import { sortSections } from "../TeacherModals";
import { useToast } from "../Toast";
import {
  AlertIcon,
  ArrowRightIcon,
  AwardIcon,
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  ClipboardIcon,
  ClockIcon,
  DatabaseIcon,
  PlusIcon,
  SparklesIcon,
  TrendIcon,
  UsersIcon,
  XCircleIcon,
} from "../icons";
import { Button, ButtonLink, Card, CardHeader, EmptyState, PageLoading, StatCard } from "../ui";

function attendanceHref(sectionId: string, subjectId: string, date: string) {
  return `/attendance?section=${sectionId}&subject=${subjectId}&date=${date}`;
}

export function DashboardView() {
  const { students, attendance, sections, subjects, users, settings, flags, ready } = useAppData();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  // Captured once per visit (in the browser only — never during the server prerender); ages the last backup.
  const [now] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));
  const today = ready ? todayISO() : "";
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Unknown subject";
  const sorted = useMemo(() => sortSections(sections), [sections]);

  const todayRecords = useMemo(() => attendance.filter((r) => r.date === today), [attendance, today]);
  const todayCounts = countStatuses(todayRecords);

  const week = useMemo(() => {
    if (!today) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6);
      const counts = countStatuses(attendance.filter((r) => r.date === date));
      return { date, counts, rate: attendanceRate(counts) };
    });
  }, [attendance, today]);
  const weekCounts = countStatuses(attendance.filter((r) => week.length > 0 && r.date >= week[0].date && r.date <= today));
  const maxDay = Math.max(1, ...week.map((d) => d.counts.total));

  // Every subject session scheduled today across all sections.
  const todaySessions = useMemo(() => {
    if (!today) return [];
    return sorted.flatMap((cs) =>
      subjectsOn(cs, today).map((subjectId) => {
        const roster = students.filter(
          (s) => s.status === "active" && s.classGroup === cs.classGroup && s.shift === cs.shift && s.section === cs.section,
        ).length;
        const marked = todayRecords.filter((r) => r.classSectionId === cs.id && r.subjectId === subjectId).length;
        return { cs, subjectId, roster, marked, teachers: teachersFor(users, cs.id, subjectId) };
      }),
    );
  }, [sorted, students, todayRecords, users, today]);

  const activity = useMemo(() => {
    const sessions = new Map<string, { records: AttendanceRecord[]; latest: string; by: string }>();
    for (const r of attendance) {
      const key = sessionKey(r);
      const s = sessions.get(key) ?? { records: [], latest: r.recordedAt, by: r.recordedByName };
      s.records.push(r);
      if (r.recordedAt >= s.latest) {
        s.latest = r.recordedAt;
        s.by = r.recordedByName;
      }
      sessions.set(key, s);
    }
    return [...sessions.values()].sort((a, b) => b.latest.localeCompare(a.latest)).slice(0, 6);
  }, [attendance]);

  // At-risk: overall (all-time) rate below 75%. Perfect: 100% over the last 30 days.
  const insights = useMemo(() => {
    if (!today) return { atRisk: [], perfect: [] };
    const since = addDays(today, -29);
    const active = students.filter((s) => s.status === "active");
    const byStudent = new Map<string, AttendanceRecord[]>();
    for (const r of attendance) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
    const atRisk = active
      .map((s) => ({ s, rate: attendanceRate(countStatuses(byStudent.get(s.id) ?? [])) }))
      .filter((x): x is { s: (typeof active)[number]; rate: number } => x.rate !== null && x.rate < 75)
      .sort((a, b) => a.rate - b.rate);
    const perfect = active
      .map((s) => {
        const recent = (byStudent.get(s.id) ?? []).filter((r) => r.date >= since);
        return { s, rate: attendanceRate(countStatuses(recent)), sessions: recent.length };
      })
      .filter((x) => x.sessions > 0 && x.rate === 100)
      .sort((a, b) => b.sessions - a.sessions || a.s.fullName.localeCompare(b.s.fullName));
    return { atRisk, perfect };
  }, [students, attendance, today]);

  if (!ready) return <PageLoading />;

  const activeCount = students.filter((s) => s.status === "active").length;
  const withTimetable = sorted.filter(hasTimetable);
  const doneToday = todaySessions.filter((s) => s.marked > 0).length;

  if (students.length === 0) {
    return (
      <>
        <Card>
          <EmptyState
            className="py-20"
            icon={<SparklesIcon />}
            title={`Welcome to ${settings.instituteName}`}
            hint="Start by adding your students, or load demo data to explore subjects, sections, timetables and teachers with realistic records."
            action={
              <>
                <Button onClick={() => setAdding(true)}>
                  <PlusIcon width={16} height={16} /> Add your first student
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    try {
                      const demo = loadDemoData();
                      toast.success(
                        "Demo data loaded",
                        `${demo.students} students, ${demo.sections} timetabled sections, ${demo.teachers} teachers, ${demo.records} records.`,
                      );
                    } catch (err) {
                      toast.error("Could not load demo data", err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  <SparklesIcon width={16} height={16} /> Load demo data
                </Button>
              </>
            }
          />
        </Card>
        {adding && <StudentFormModal onClose={() => setAdding(false)} />}
      </>
    );
  }

  const todayRate = attendanceRate(todayCounts);
  const unmarkedToday = todaySessions.filter((s) => s.marked === 0);

  // Backup reminder: never backed up, or last backup older than 7 days (unless snoozed).
  const lastBackup = flags.lastBackupAt ? new Date(flags.lastBackupAt).getTime() : null;
  const backupDue =
    (lastBackup === null || now - lastBackup > 7 * 24 * 3600 * 1000) &&
    !(flags.backupSnoozedUntil && new Date(flags.backupSnoozedUntil).getTime() > now);

  return (
    <div className="space-y-6">
      {backupDue && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-[14px] border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-sm text-amber-800">
            <DatabaseIcon width={18} height={18} className="mt-0.5 shrink-0" />
            <span>
              <strong>Back up your data.</strong>{" "}
              {lastBackup === null
                ? "You have never downloaded a backup."
                : `Your last backup was ${relativeTime(flags.lastBackupAt!)}.`}{" "}
              Everything lives in this browser — a backup protects it if the browser data is cleared.
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={snoozeBackupReminder}>
              Remind me tomorrow
            </Button>
            <Button
              size="sm"
              onClick={() => {
                try {
                  toast.success("Backup downloaded", downloadBackup());
                } catch (err) {
                  toast.error("Backup failed", err instanceof Error ? err.message : String(err));
                }
              }}
            >
              <DatabaseIcon width={14} height={14} /> Download backup
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          label="Total Active Students"
          value={<CountUp value={activeCount} />}
          hint={`${students.length - activeCount} inactive`}
          icon={<UsersIcon />}
        />
        <StatCard
          label="Present Today"
          value={<CountUp value={todayCounts.present} />}
          hint={`${todayCounts.total} marks · ${doneToday}/${todaySessions.length} sessions`}
          icon={<CheckCircleIcon />}
          tone="emerald"
        />
        <StatCard label="Late Today" value={<CountUp value={todayCounts.late} />} hint={`${todayCounts.excused} excused`} icon={<ClockIcon />} tone="amber" />
        <StatCard
          label="Absent Today"
          value={<CountUp value={todayCounts.absent} />}
          hint={todayCounts.total ? "across today's sessions" : "No marks yet today"}
          icon={<XCircleIcon />}
          tone="red"
        />
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            label="Attendance Rate"
            value={
              <span className={rateColor(todayRate)}>{todayRate === null ? "—" : <CountUp value={Math.round(todayRate)} suffix="%" />}</span>
            }
            hint={`Today · 7-day avg ${formatRate(attendanceRate(weekCounts))}`}
            icon={<TrendIcon />}
            tone="slate"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <InsightCard
          tone="red"
          icon={<AlertIcon width={16} height={16} />}
          title="At-Risk Students"
          subtitle="Overall attendance below 75%"
          count={insights.atRisk.length}
          empty="No student is below 75%. 🎉"
        >
          {insights.atRisk.map(({ s, rate }) => (
            <InsightRow
              key={s.id}
              title={s.fullName}
              subtitle={sectionShort(s)}
              value={<span className="font-semibold text-red-600 tabular-nums">{rate.toFixed(1)}%</span>}
              action={
                <ButtonLink href={`/students?view=${s.id}`} variant="secondary" size="sm">
                  View Profile
                </ButtonLink>
              }
            />
          ))}
        </InsightCard>
        <InsightCard
          tone="emerald"
          icon={<AwardIcon width={16} height={16} />}
          title="Perfect Attendance"
          subtitle="100% over the last 30 days"
          count={insights.perfect.length}
          empty="No student has a perfect record in the last 30 days yet."
        >
          {insights.perfect.map(({ s, sessions }) => (
            <InsightRow
              key={s.id}
              title={s.fullName}
              subtitle={`${sectionShort(s)} · ${sessions} marks`}
              value={<span className="font-semibold text-emerald-600">100%</span>}
              action={
                <ButtonLink href={`/students?view=${s.id}`} variant="ghost" size="sm">
                  View
                </ButtonLink>
              }
            />
          ))}
        </InsightCard>
        <InsightCard
          tone="amber"
          icon={<ClockIcon width={16} height={16} />}
          title="Unmarked Today"
          subtitle={`${dayName(dayAbbr(today))}'s sessions not saved yet`}
          count={unmarkedToday.length}
          empty={todaySessions.length ? "Every session today has been saved. ✅" : "No sessions are scheduled today."}
        >
          {unmarkedToday.map((s) => (
            <InsightRow
              key={`${s.cs.id}|${s.subjectId}`}
              title={subjectName(s.subjectId)}
              subtitle={`${sectionShort(s.cs)} · ${s.teachers.map((t) => t.name).join(", ") || "No teacher"}`}
              action={
                <ButtonLink href={attendanceHref(s.cs.id, s.subjectId, today)} size="sm">
                  Take Attendance
                </ButtonLink>
              }
            />
          ))}
        </InsightCard>
      </div>

      <Card>
        <CardHeader
          title="Today's Schedule"
          subtitle={`${dayName(dayAbbr(today))}, ${formatDate(today)} · ${todaySessions.length} subject session${todaySessions.length === 1 ? "" : "s"}`}
          actions={
            <ButtonLink href="/attendance" variant="ghost" size="sm">
              Take attendance <ArrowRightIcon width={14} height={14} />
            </ButtonLink>
          }
        />
        {withTimetable.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon />}
            title="No timetable yet"
            hint="Build a weekly timetable for each class section so subject sessions appear here."
            action={
              <ButtonLink href="/settings#timetable">
                <CalendarIcon width={16} height={16} /> Set up timetable
              </ButtonLink>
            }
          />
        ) : todaySessions.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon />}
            title="No classes today"
            hint={`No section has a subject scheduled on ${dayName(dayAbbr(today))}.`}
            action={
              <ButtonLink href="/reports" variant="secondary">
                Open reports
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {todaySessions.map((s) => {
              const done = s.marked > 0;
              return (
                <li
                  key={`${s.cs.id}|${s.subjectId}`}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-4 transition hover:shadow-sm",
                    done ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{subjectName(s.subjectId)}</p>
                      <p className="text-xs text-slate-500">{sectionShort(s.cs)}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        done ? "bg-emerald-100 text-emerald-700" : "bg-amber-50 text-amber-700",
                      )}
                    >
                      {done ? `Saved · ${s.marked}/${s.roster}` : "Not saved"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {s.teachers.length ? (
                      <>Teacher: {s.teachers.map((t) => t.name).join(", ")}</>
                    ) : (
                      <span className="text-amber-600">No teacher assigned</span>
                    )}
                  </p>
                  <ButtonLink
                    href={attendanceHref(s.cs.id, s.subjectId, today)}
                    size="sm"
                    variant={done ? "secondary" : "primary"}
                    className="self-start"
                  >
                    {done ? "Review" : "Take Attendance"}
                  </ButtonLink>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="7-day attendance trend"
            subtitle="Marks per day across all subject sessions, stacked by status"
            actions={
              <ButtonLink href="/reports" variant="ghost" size="sm">
                Open reports <ArrowRightIcon width={14} height={14} />
              </ButtonLink>
            }
          />
          {weekCounts.total === 0 ? (
            <EmptyState
              icon={<ChartIcon />}
              title="No attendance in the last 7 days"
              hint="Save a subject session and the trend will appear here."
              action={
                <ButtonLink href="/attendance">
                  <ClipboardIcon width={16} height={16} /> Take attendance
                </ButtonLink>
              }
            />
          ) : (
            <div className="px-5 pt-4 pb-5">
              <div className="flex h-56 items-end gap-2 sm:gap-4">
                {week.map((d) => (
                  <div key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end">
                    <span className={cn("mb-1 text-xs font-medium tabular-nums", rateColor(d.rate))}>{formatRate(d.rate)}</span>
                    <div
                      className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-md bg-slate-100 transition-opacity group-hover:opacity-80"
                      style={{ height: `${Math.max(4, (d.counts.total / maxDay) * 100)}%` }}
                      title={`${formatDate(d.date)}: ${STATUSES.map((s) => `${d.counts[s]} ${STATUS_META[s].label}`).join(", ")}`}
                    >
                      {STATUSES.map((s) =>
                        d.counts[s] ? (
                          <div key={s} className={STATUS_META[s].bar} style={{ height: `${(d.counts[s] / d.counts.total) * 100}%` }} />
                        ) : null,
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2 sm:gap-4">
                {week.map((d) => (
                  <div key={d.date} className="flex-1 text-center">
                    <p className={cn("text-xs font-medium", d.date === today ? "text-indigo-600" : "text-slate-600")}>
                      {d.date === today ? "Today" : formatWeekday(d.date)}
                    </p>
                    <p className="text-[11px] text-slate-400">{d.date.slice(8)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3">
                {STATUSES.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={cn("h-2.5 w-2.5 rounded-sm", STATUS_META[s].bar)} />
                    {STATUS_META[s].label} <span className="font-medium text-slate-700 tabular-nums">{weekCounts[s]}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent activity" subtitle="Latest saved subject sessions" />
          {activity.length === 0 ? (
            <EmptyState
              icon={<ClockIcon />}
              title="No activity yet"
              hint="Saved subject sessions will show up here."
              action={
                <ButtonLink href="/attendance" variant="secondary">
                  Take attendance
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map(({ records, latest, by }) => {
                const r = records[0];
                const c = countStatuses(records);
                const cs = sections.find((s) => s.id === r.classSectionId);
                return (
                  <li key={sessionKey(r)}>
                    <ButtonLink
                      href={attendanceHref(r.classSectionId, r.subjectId, r.date)}
                      variant="ghost"
                      className="h-auto w-full justify-start rounded-none px-5 py-3 text-left"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <ClipboardIcon width={16} height={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {subjectName(r.subjectId)} · {cs ? sectionShort(cs) : "Removed section"}
                        </span>
                        <span className="block truncate text-xs font-normal text-slate-500">
                          {formatDate(r.date)} · {c.present} P · {c.late} L · {c.absent} A · {c.excused} E · by {by}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-normal text-slate-400">{relativeTime(latest)}</span>
                    </ButtonLink>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Weekly timetable"
          subtitle="Every section's week at a glance"
          actions={
            <ButtonLink href="/settings#timetable" variant="ghost" size="sm">
              Edit timetables <ArrowRightIcon width={14} height={14} />
            </ButtonLink>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Section</th>
                {WEEK_ORDER.map((d) => (
                  <th key={d} className={cn("px-2 py-3 font-medium", d === dayAbbr(today) && "text-indigo-600")}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((cs) => {
                const days = groupDays(cs.classGroup);
                return (
                  <tr key={cs.id} className="align-top">
                    <td className="px-4 py-3 font-medium whitespace-nowrap text-slate-800">{sectionShort(cs)}</td>
                    {!hasTimetable(cs) ? (
                      <td colSpan={7} className="px-2 py-3">
                        <ButtonLink href={`/settings?section=${cs.id}#timetable`} variant="secondary" size="sm">
                          <CalendarIcon width={14} height={14} /> Set up timetable
                        </ButtonLink>
                      </td>
                    ) : (
                      WEEK_ORDER.map((d) => (
                        <td key={d} className={cn("px-2 py-3", d === dayAbbr(today) && "bg-indigo-50/40")}>
                          {days.includes(d) ? (
                            <div className="flex flex-col gap-1">
                              {(cs.schedule[d] ?? []).map((id) => (
                                <span key={id} className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
                                  {subjectName(id)}
                                </span>
                              ))}
                              {(cs.schedule[d] ?? []).length === 0 && <span className="text-xs text-slate-300">Free</span>}
                            </div>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      ))
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const INSIGHT_TONES = {
  red: { ring: "border-red-200", head: "bg-red-50 text-red-700", badge: "bg-red-600" },
  emerald: { ring: "border-emerald-200", head: "bg-emerald-50 text-emerald-700", badge: "bg-emerald-600" },
  amber: { ring: "border-amber-200", head: "bg-amber-50 text-amber-700", badge: "bg-amber-500" },
};

function InsightCard({
  tone,
  icon,
  title,
  subtitle,
  count,
  empty,
  children,
}: {
  tone: keyof typeof INSIGHT_TONES;
  icon: ReactNode;
  title: string;
  subtitle: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  const t = INSIGHT_TONES[tone];
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-[14px] border bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]", t.ring)}>
      <div className={cn("flex items-center justify-between gap-3 px-4 py-3", t.head)}>
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="truncate text-xs opacity-80">{subtitle}</p>
          </div>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold text-white tabular-nums", t.badge)}>{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">{children}</ul>
      )}
    </section>
  );
}

function InsightRow({ title, subtitle, value, action }: { title: string; subtitle: string; value?: ReactNode; action: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{title}</p>
        <p className="truncate text-xs text-slate-500">{subtitle}</p>
      </div>
      {value && <span className="shrink-0 text-sm">{value}</span>}
      <span className="shrink-0">{action}</span>
    </li>
  );
}
