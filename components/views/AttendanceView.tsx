"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAppData, useCurrentUser } from "@/lib/hooks";
import { logout, saveSession } from "@/lib/storage";
import type { AttendanceStatus, ClassSection, SessionRef } from "@/lib/types";
import {
  STATUSES,
  STATUS_META,
  addDays,
  cn,
  countStatuses,
  dayAbbr,
  dayName,
  formatDate,
  formatDateLong,
  formatDateTime,
  hasTimetable,
  isValidISODate,
  latestSessionDate,
  sectionLabel,
  sectionShort,
  subjectsOn,
  todayISO,
} from "@/lib/utils";
import { ConfirmModal } from "../Modal";
import { burstConfetti } from "../Polish";
import { useNavGuard } from "../NavGuard";
import { StudentFormModal } from "../StudentFormModal";
import { initials } from "../StudentProfile";
import { sortSections } from "../TeacherModals";
import { useToast } from "../Toast";
import { CalendarIcon, CheckCircleIcon, CheckIcon, ClipboardIcon, ClockIcon, LogoutIcon, PlusIcon, RotateIcon, SettingsIcon, UsersIcon } from "../icons";
import { Button, ButtonLink, Card, EmptyState, Field, PageLoading, Select, inputClass } from "../ui";

type Mark = { status: AttendanceStatus | null; note: string };
type Marks = Record<string, Mark>;
type Selection = { section: string; subject: string; date: string };

const EMPTY_MARK: Mark = { status: null, note: "" };
const sameMark = (a: Mark = EMPTY_MARK, b: Mark = EMPTY_MARK) => a.status === b.status && a.note.trim() === b.note.trim();
const UNSAVED_MESSAGE = "You have unsaved attendance marks. If you leave now, they will be lost.";

export function AttendanceView() {
  const { sections, subjects, students, attendance, ready } = useAppData();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { setBlocker, runGuarded } = useNavGuard();
  const { user } = useCurrentUser();
  const isTeacher = user?.role === "teacher";

  const today = ready ? todayISO() : "";
  const sorted = useMemo(() => sortSections(sections), [sections]);
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Unknown subject";

  // Teachers only ever see their own (still existing) subject sessions.
  const mySessions: SessionRef[] = useMemo(
    () =>
      (user?.assignedSessions ?? []).filter(
        (a) => sections.some((s) => s.id === a.classSectionId) && subjects.some((s) => s.id === a.subjectId),
      ),
    [user, sections, subjects],
  );
  const isMine = (sectionId: string, subjectId: string) =>
    !isTeacher || mySessions.some((a) => a.classSectionId === sectionId && a.subjectId === subjectId);

  // The URL is the source of truth, so links and refreshes keep the selected session.
  const paramSection = params.get("section") ?? "";
  const paramSubject = params.get("subject") ?? "";
  const paramDate = params.get("date") ?? "";
  const date = isValidISODate(paramDate) && paramDate <= today ? paramDate : today;
  const cs: ClassSection | undefined = isTeacher
    ? mySessions.some((a) => a.classSectionId === paramSection)
      ? sections.find((s) => s.id === paramSection)
      : undefined
    : (sections.find((s) => s.id === paramSection) ?? sorted[0]);

  // Subjects of this section on this weekday that the user may take.
  const daySubjects = cs ? subjectsOn(cs, date).filter((id) => isMine(cs.id, id)) : [];
  const subject = daySubjects.includes(paramSubject) ? paramSubject : daySubjects.length === 1 ? daySubjects[0] : "";
  const hasSession = !!cs && !!subject;
  const key = `${date}|${cs?.id ?? ""}|${subject}`;

  const [draft, setDraft] = useState<{ key: string; marks: Marks } | null>(null);
  const [pendingSelection, setPendingSelection] = useState<Selection | null>(null);
  const [adding, setAdding] = useState(false);

  // Plain derivations; the React Compiler memoizes them.
  const sessionRecords = attendance.filter((r) => r.date === date && r.classSectionId === cs?.id && r.subjectId === subject);
  const recordedIds = new Set(sessionRecords.map((r) => r.studentId));
  const roster = cs
    ? students
        .filter(
          (s) =>
            s.classGroup === cs.classGroup &&
            s.shift === cs.shift &&
            s.section === cs.section &&
            (s.status === "active" || recordedIds.has(s.id)),
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
    : [];
  const baseline: Marks = {};
  for (const r of sessionRecords) baseline[r.studentId] = { status: r.status, note: r.note ?? "" };

  const marks = draft?.key === key ? draft.marks : baseline;
  const dirty = hasSession && draft?.key === key && roster.some((s) => !sameMark(marks[s.id], baseline[s.id]));
  const counts = countStatuses(roster.map((s) => marks[s.id] ?? EMPTY_MARK));
  const unmarked = roster.length - counts.total;
  const lastSaved = sessionRecords.reduce<(typeof sessionRecords)[number] | null>(
    (latest, r) => (!latest || r.recordedAt > latest.recordedAt ? r : latest),
    null,
  );

  useEffect(() => {
    setBlocker(dirty ? UNSAVED_MESSAGE : null);
  }, [dirty, setBlocker]);
  useEffect(() => () => setBlocker(null), [setBlocker]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (!ready || !user) return <PageLoading />;

  function applySelection(next: Selection) {
    const qs = new URLSearchParams();
    if (next.section) qs.set("section", next.section);
    if (next.subject) qs.set("subject", next.subject);
    qs.set("date", next.date);
    setDraft(null);
    router.replace(`${pathname}?${qs}`, { scroll: false });
  }

  function changeSelection(patch: Partial<Selection>) {
    const next = { section: cs?.id ?? "", subject, date, ...patch };
    if (dirty) setPendingSelection(next);
    else applySelection(next);
  }

  /** Most recent date (≤ today) when the user has any class in this section. */
  function latestClassDay(section: ClassSection): string | null {
    for (let i = 0; i <= 14; i++) {
      const d = addDays(today, -i);
      if (subjectsOn(section, d).some((id) => isMine(section.id, id))) return d;
    }
    return null;
  }

  function updateMarks(fn: (current: Marks) => Marks) {
    setDraft({ key, marks: fn(marks) });
  }

  function setStatus(id: string, status: AttendanceStatus) {
    updateMarks((m) => {
      const cur = m[id] ?? EMPTY_MARK;
      return { ...m, [id]: { ...cur, status: cur.status === status ? null : status } };
    });
  }

  function setNote(id: string, note: string) {
    updateMarks((m) => ({ ...m, [id]: { ...(m[id] ?? EMPTY_MARK), note } }));
  }

  function markAllPresent() {
    updateMarks((m) => Object.fromEntries(roster.map((s) => [s.id, { ...(m[s.id] ?? EMPTY_MARK), status: "present" as const }])));
  }

  function resetAll() {
    updateMarks(() => Object.fromEntries(roster.map((s) => [s.id, EMPTY_MARK])));
  }

  function handleSave(button?: HTMLElement) {
    if (!user || !cs || !subject) return;
    try {
      const { saved, removed } = saveSession(
        date,
        cs.id,
        subject,
        roster.map((s) => ({ studentId: s.id, status: marks[s.id]?.status ?? null, note: marks[s.id]?.note ?? "" })),
        user,
      );
      setDraft(null);
      const parts = [`Saved by ${user.name}`, `${saved} mark${saved === 1 ? "" : "s"}`];
      if (removed) parts.push(`${removed} cleared`);
      if (unmarked) parts.push(`${unmarked} left unmarked`);
      toast.success(`${subjectName(subject)} · ${sectionShort(cs)} saved`, parts.join(" · "));
      burstConfetti(button);
    } catch (err) {
      toast.error("Could not save attendance", err instanceof Error ? err.message : String(err));
    }
  }

  /* ---------- Page-level empty states ---------- */

  if (isTeacher && mySessions.length === 0) {
    return (
      <Card>
        <EmptyState
          className="py-20"
          icon={<ClipboardIcon />}
          title="No sessions assigned to you yet"
          hint="Your principal assigns subjects and class sections on the Teachers page. Once assigned, your sessions appear here."
          action={
            <Button variant="secondary" onClick={() => runGuarded(logout)}>
              <LogoutIcon width={16} height={16} /> Sign out
            </Button>
          }
        />
      </Card>
    );
  }

  if (!isTeacher && sections.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<SettingsIcon />}
          title="Set up classes first"
          hint="Add class groups, shifts and sections in Settings."
          action={<ButtonLink href="/settings#timetable">Open settings</ButtonLink>}
        />
      </Card>
    );
  }

  /* ---------- Session pickers ---------- */

  const dateInput = (
    <input
      id="at-date"
      type="date"
      className={inputClass}
      value={date}
      max={today}
      onChange={(e) => e.target.value && changeSelection({ date: e.target.value })}
    />
  );

  // Teacher cards: today's sessions first, then by how recently they were taught.
  const teacherCards = mySessions
    .map((a) => {
      const section = sections.find((s) => s.id === a.classSectionId)!;
      const lastDate = latestSessionDate(section, a.subjectId, today);
      return { ...a, section, todayScheduled: subjectsOn(section, today).includes(a.subjectId), lastDate };
    })
    .sort(
      (a, b) =>
        Number(b.todayScheduled) - Number(a.todayScheduled) ||
        (b.lastDate ?? "").localeCompare(a.lastDate ?? "") ||
        sectionShort(a.section).localeCompare(sectionShort(b.section)),
    );

  const scheduledDays = cs ? Object.entries(cs.schedule).filter(([, ids]) => ids.length) : [];

  return (
    <div className="space-y-4 pb-4">
      {isTeacher ? (
        <Card className="p-4 sm:p-5">
          <p className="mb-3 text-sm font-semibold text-slate-900">
            Your sessions <span className="font-normal text-slate-400">· today&apos;s classes first</span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teacherCards.map((c) => {
              const selected = cs?.id === c.classSectionId && subject === c.subjectId;
              const targetDate = c.todayScheduled ? today : (c.lastDate ?? today);
              const taken = attendance.some(
                (r) => r.date === targetDate && r.classSectionId === c.classSectionId && r.subjectId === c.subjectId,
              );
              return (
                <button
                  key={`${c.classSectionId}|${c.subjectId}`}
                  type="button"
                  onClick={() => !selected && changeSelection({ section: c.classSectionId, subject: c.subjectId, date: targetDate })}
                  aria-pressed={selected}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-xl border p-4 text-left transition",
                    selected
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20"
                      : c.todayScheduled
                        ? "border-indigo-200 bg-indigo-50/40 hover:border-indigo-400 hover:shadow-sm"
                        : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50 hover:shadow-sm",
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("text-sm font-semibold", selected ? "text-indigo-700" : "text-slate-900")}>
                      {subjectName(c.subjectId)}
                    </span>
                    {c.todayScheduled && (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white">Today</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-600">{sectionLabel(c.section)}</span>
                  <span className={cn("inline-flex items-center gap-1 text-xs font-medium", taken ? "text-emerald-600" : "text-slate-400")}>
                    {taken ? <CheckCircleIcon width={14} height={14} /> : <ClockIcon width={14} height={14} />}
                    {!hasTimetable(c.section)
                      ? "No timetable yet"
                      : c.todayScheduled
                        ? taken
                          ? "Taken today"
                          : "Not taken today"
                        : c.lastDate
                          ? `Last class ${formatDate(c.lastDate)}${taken ? " · taken" : ""}`
                          : "Not scheduled recently"}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Field label="Class section" htmlFor="at-section">
              <Select
                id="at-section"
                value={cs?.id ?? ""}
                onChange={(e) => changeSelection({ section: e.target.value, subject: "" })}
                options={sorted.map((s) => ({ value: s.id, label: sectionLabel(s) }))}
              />
            </Field>
            <Field label="Date" htmlFor="at-date">
              {dateInput}
            </Field>
          </div>
        </Card>
      )}

      {cs && (
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">{sectionLabel(cs)}</p>
              <p className="text-base font-semibold text-slate-900">{formatDateLong(date)}</p>
            </div>
            {isTeacher && (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Date" htmlFor="at-date" className="w-44">
                  {dateInput}
                </Field>
                {date !== today && (
                  <Button variant="secondary" onClick={() => changeSelection({ date: today })}>
                    Today
                  </Button>
                )}
              </div>
            )}
          </div>

          {hasTimetable(cs) && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate-500">Subject session</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Subject session">
                {scheduledDays.flatMap(([day, ids]) =>
                  ids
                    .filter((id) => isMine(cs.id, id))
                    .map((id) => {
                      const onThisDay = day === dayAbbr(date);
                      const selected = onThisDay && id === subject;
                      return (
                        <button
                          key={`${day}|${id}`}
                          type="button"
                          disabled={!onThisDay}
                          onClick={() => changeSelection({ subject: id })}
                          aria-pressed={selected}
                          title={onThisDay ? undefined : `Taught on ${dayName(day)}`}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium transition",
                            selected
                              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                              : onThisDay
                                ? "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
                                : "cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-400",
                          )}
                        >
                          {subjectName(id)}
                          <span className={cn("text-[11px]", selected ? "text-indigo-100" : "text-slate-400")}>{day}</span>
                        </button>
                      );
                    }),
                )}
              </div>
            </div>
          )}

          {hasSession && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              {lastSaved ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckIcon width={12} height={12} /> Saved by {lastSaved.recordedByName} · {formatDateTime(lastSaved.recordedAt)}
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Not taken yet</span>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ---------- Session body ---------- */}
      {!cs ? (
        <Card>
          <EmptyState
            icon={<ClipboardIcon />}
            title="Pick a session to start"
            hint="Choose one of your subject sessions above to load its roster."
            action={
              teacherCards[0] && (
                <Button
                  onClick={() =>
                    changeSelection({
                      section: teacherCards[0].classSectionId,
                      subject: teacherCards[0].subjectId,
                      date: teacherCards[0].todayScheduled ? today : (teacherCards[0].lastDate ?? today),
                    })
                  }
                >
                  Open {subjectName(teacherCards[0].subjectId)} · {sectionShort(teacherCards[0].section)}
                </Button>
              )
            }
          />
        </Card>
      ) : !hasTimetable(cs) ? (
        <Card>
          <EmptyState
            icon={<CalendarIcon />}
            title="No timetable yet"
            hint={
              isTeacher
                ? "Ask the principal to set the timetable for this class section."
                : `${sectionLabel(cs)} has no weekly timetable, so there are no subject sessions to take.`
            }
            action={
              !isTeacher && (
                <ButtonLink href={`/settings?section=${cs.id}#timetable`}>
                  <CalendarIcon width={16} height={16} /> Set up timetable
                </ButtonLink>
              )
            }
          />
        </Card>
      ) : daySubjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarIcon />}
            title="No classes this day"
            hint={`${sectionShort(cs)} has no ${isTeacher ? "sessions of yours" : "subject sessions"} on ${dayName(dayAbbr(date))}.`}
            action={(() => {
              const d = latestClassDay(cs);
              return d && d !== date ? (
                <Button variant="secondary" onClick={() => changeSelection({ date: d, subject: "" })}>
                  Go to {formatDate(d)} ({dayName(dayAbbr(d))})
                </Button>
              ) : null;
            })()}
          />
        </Card>
      ) : !subject ? (
        <Card>
          <EmptyState
            icon={<ClipboardIcon />}
            title="Pick a subject session"
            hint={`${daySubjects.length} subjects are taught on ${dayName(dayAbbr(date))}. Choose one above.`}
            action={
              <Button onClick={() => changeSelection({ subject: daySubjects[0] })}>Open {subjectName(daySubjects[0])}</Button>
            }
          />
        </Card>
      ) : roster.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UsersIcon />}
            title={`No active students in ${sectionShort(cs)}`}
            hint={
              isTeacher
                ? "Ask your principal to add students to this section."
                : "Add a student to this section, or choose another section above."
            }
            action={
              !isTeacher && (
                <>
                  <Button onClick={() => setAdding(true)}>
                    <PlusIcon width={16} height={16} /> Add student to this section
                  </Button>
                  <ButtonLink href="/students" variant="secondary">
                    Manage students
                  </ButtonLink>
                </>
              )
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
            <p className="text-sm font-semibold text-slate-900">
              {subjectName(subject)} <span className="font-normal text-slate-400">· {roster.length} students</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={markAllPresent}>
                <CheckIcon width={14} height={14} className="text-emerald-600" /> Mark all Present
              </Button>
              <Button variant="secondary" size="sm" onClick={resetAll} disabled={counts.total === 0}>
                <RotateIcon width={14} height={14} /> Reset
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {roster.map((s) => {
              const mark = marks[s.id] ?? EMPTY_MARK;
              const changed = !sameMark(mark, baseline[s.id]);
              return (
                <li
                  key={s.id}
                  className={cn(
                    "grid grid-cols-1 gap-3 px-4 py-3 transition-colors sm:px-5 lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)] lg:items-center",
                    changed && "bg-indigo-50/40",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {initials(s.fullName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {s.fullName}
                        {s.status === "inactive" && <span className="ml-2 text-xs font-normal text-slate-400">(inactive)</span>}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">{s.phone}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`Status for ${s.fullName}`}>
                    {STATUSES.map((st) => {
                      const active = mark.status === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStatus(s.id, st)}
                          aria-pressed={active}
                          className={cn(
                            "h-9 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:px-3",
                            active ? STATUS_META[st].solid : cn("border-slate-200 bg-white text-slate-600", STATUS_META[st].ring),
                          )}
                        >
                          {STATUS_META[st].label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    aria-label={`Note for ${s.fullName}`}
                    placeholder="Note (optional)"
                    className={cn(inputClass, "h-9")}
                    value={mark.note}
                    onChange={(e) => setNote(s.id, e.target.value)}
                    maxLength={200}
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {hasSession && roster.length > 0 && (
        <div className="sticky bottom-3 z-10 print:hidden">
          <div className="flex flex-col gap-3 rounded-[14px] border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
                {STATUSES.map((st, i) => (
                  <span key={st} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span className="text-slate-300">·</span>}
                    <span className={cn("h-2 w-2 rounded-full", STATUS_META[st].bar)} />
                    <span className="font-semibold text-slate-900">{counts[st]}</span>
                    <span className="text-slate-500">{STATUS_META[st].label}</span>
                  </span>
                ))}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {unmarked > 0 ? `${unmarked} not marked · ` : "Everyone marked · "}
                {dirty ? (
                  <span className="font-medium text-amber-600">Unsaved changes</span>
                ) : lastSaved ? (
                  <span className="text-emerald-600">All changes saved</span>
                ) : (
                  "Nothing saved yet"
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {dirty && (
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Discard
                </Button>
              )}
              <Button onClick={(e) => handleSave(e.currentTarget)} disabled={!dirty} className="flex-1 sm:flex-none">
                <CheckIcon width={16} height={16} /> Save attendance
              </Button>
            </div>
          </div>
        </div>
      )}

      {adding && cs && (
        <StudentFormModal defaults={{ classGroup: cs.classGroup, shift: cs.shift, section: cs.section }} onClose={() => setAdding(false)} />
      )}
      <ConfirmModal
        open={pendingSelection !== null}
        title="Discard unsaved marks?"
        message="You changed marks for this session but haven't saved them. Switching session or date will discard those changes."
        confirmLabel="Discard changes"
        onConfirm={() => {
          if (pendingSelection) applySelection(pendingSelection);
          setPendingSelection(null);
        }}
        onCancel={() => setPendingSelection(null)}
      />
    </div>
  );
}
