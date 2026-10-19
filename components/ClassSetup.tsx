"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAppData } from "@/lib/hooks";
import {
  addSection,
  addSubject,
  deleteSection,
  deleteSubject,
  renameSubject,
  restoreSubject,
  saveSchedule,
  sectionInUse,
  subjectInUse,
} from "@/lib/storage";
import type { ClassSection, Subject, WeekSchedule } from "@/lib/types";
import { cn, dayName, groupDays, hasTimetable, scheduleIssues, sectionLabel } from "@/lib/utils";
import { ConfirmModal } from "./Modal";
import { useToast } from "./Toast";
import { AlertIcon, CalendarIcon, CheckCircleIcon, CheckIcon, PencilIcon, PlusIcon, RotateIcon, TrashIcon } from "./icons";
import { Button, Card, CardHeader, Select, inputClass } from "./ui";

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* ---------------------------------------------------------------- Subjects */

export function SubjectsCard() {
  const { subjects, sections, users, attendance } = useAppData();
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);

  const usage = (id: string) => ({
    timetables: sections.filter((s) => Object.values(s.schedule).some((l) => l.includes(id))).length,
    teachers: users.filter((u) => u.assignedSessions.some((a) => a.subjectId === id)).length,
    records: attendance.filter((r) => r.subjectId === id).length,
  });

  function add(e: FormEvent) {
    e.preventDefault();
    try {
      const s = addSubject(name);
      setName("");
      setError("");
      toast.success(`Added "${s.name}"`, "Add it to each timetable so every section has it once a week.");
    } catch (err) {
      setError(errMsg(err));
    }
  }

  function saveRename(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const s = renameSubject(editing.id, editing.name);
      setEditing(null);
      toast.success("Subject renamed", s.name);
    } catch (err) {
      toast.error("Could not rename subject", errMsg(err));
    }
  }

  function askDelete(s: Subject) {
    const reason = subjectInUse(s.id);
    if (reason) {
      toast.error(`Can't delete "${s.name}"`, reason);
      return;
    }
    setDeleting(s);
  }

  return (
    <Card>
      <CardHeader title="Subjects" subtitle="Every class studies these subjects. Each must appear once in every section's week." />
      <div className="space-y-4 p-5">
        {subjects.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
            No subjects yet. Add the first one below.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-[10px] border border-slate-200">
            {subjects.map((s) => {
              const u = usage(s.id);
              const isEditing = editing?.id === s.id;
              return (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  {isEditing ? (
                    <form onSubmit={saveRename} className="flex flex-1 gap-2">
                      <input
                        aria-label={`New name for ${s.name}`}
                        className={cn(inputClass, "h-9")}
                        value={editing.name}
                        maxLength={40}
                        autoFocus
                        onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                        onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                      />
                      <Button type="submit" size="sm">
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-400">
                          {u.timetables} timetable{u.timetables === 1 ? "" : "s"} · {u.teachers} teacher{u.teachers === 1 ? "" : "s"} ·{" "}
                          {u.records} record{u.records === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditing({ id: s.id, name: s.name })}
                        aria-label={`Rename ${s.name}`}
                        title="Rename"
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <PencilIcon width={16} height={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => askDelete(s)}
                        aria-label={`Delete ${s.name}`}
                        title="Delete"
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon width={16} height={16} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={add} className="flex gap-2">
          <label htmlFor="subject-new" className="sr-only">
            New subject
          </label>
          <input
            id="subject-new"
            className={cn(inputClass, error && "border-red-400")}
            placeholder="e.g. Embroidery"
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
          <Button type="submit" variant="secondary">
            <PlusIcon width={16} height={16} /> Add
          </Button>
        </form>
        {error && <p className="-mt-2 text-xs text-red-600">{error}</p>}
      </div>
      <ConfirmModal
        open={deleting !== null}
        title="Delete subject?"
        message={`"${deleting?.name}" will be removed from the subject list. It isn't used by any timetable, teacher or record.`}
        confirmLabel="Delete subject"
        onConfirm={() => {
          if (deleting) {
            try {
              const removed = deleteSubject(deleting.id);
              toast.success("Subject deleted", removed.subject.name, {
                duration: 5000,
                action: {
                  label: "Undo",
                  onClick: () => {
                    try {
                      restoreSubject(removed);
                      toast.success("Subject restored", removed.subject.name);
                    } catch (err) {
                      toast.error("Could not restore subject", errMsg(err));
                    }
                  },
                },
              });
            } catch (err) {
              toast.error("Could not delete subject", errMsg(err));
            }
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

/* ---------------------------------------------------- Classes & Timetable */

export function TimetableCard() {
  const { settings, sections, subjects, students } = useAppData();
  const toast = useToast();
  const cardRef = useRef<HTMLDivElement>(null);
  // "Set up timetable" links pass ?section=<id> so the right section opens.
  const linkedSection = useSearchParams().get("section");

  const [selection, setSelection] = useState(() => {
    const fromHash = sections.find((s) => s.id === linkedSection);
    return fromHash
      ? { group: fromHash.classGroup, shift: fromHash.shift, sectionId: fromHash.id }
      : { group: settings.classGroups[0] ?? "", shift: settings.shifts[0] ?? "", sectionId: "" };
  });
  const [draft, setDraft] = useState<{ id: string; schedule: WeekSchedule } | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<typeof selection | null>(null);
  const [deleting, setDeleting] = useState<ClassSection | null>(null);

  // Links like "Set up timetable" land here: scroll the card into view once.
  useEffect(() => {
    if (linkedSection || window.location.hash === "#timetable") cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [linkedSection]);

  const comboSections = sections
    .filter((s) => s.classGroup === selection.group && s.shift === selection.shift)
    .sort((a, b) => a.section.localeCompare(b.section));
  const current = comboSections.find((s) => s.id === selection.sectionId) ?? comboSections[0];
  const days = groupDays(selection.group);
  const schedule = current && draft?.id === current.id ? draft.schedule : (current?.schedule ?? {});
  const issues = current ? scheduleIssues(schedule, days, subjects) : [];
  const dirty =
    !!current && draft?.id === current.id && days.some((d) => (draft.schedule[d] ?? []).join() !== (current.schedule[d] ?? []).join());

  function select(next: typeof selection) {
    if (dirty) setPendingSwitch(next);
    else {
      setDraft(null);
      setSelection(next);
    }
  }

  function toggle(day: string, subjectId: string) {
    if (!current) return;
    const list = schedule[day] ?? [];
    const nextList = list.includes(subjectId) ? list.filter((id) => id !== subjectId) : [...list, subjectId];
    setDraft({ id: current.id, schedule: { ...schedule, [day]: nextList } });
  }

  function handleSave() {
    if (!current) return;
    try {
      saveSchedule(current.id, schedule);
      setDraft(null);
      toast.success("Timetable saved", sectionLabel(current));
    } catch (err) {
      toast.error("Timetable not saved", errMsg(err));
    }
  }

  function handleAddSection() {
    try {
      const s = addSection(selection.group, selection.shift);
      select({ ...selection, sectionId: s.id });
      toast.success(`Section ${s.section} added`, `${selection.group} · ${selection.shift} — now build its timetable.`);
    } catch (err) {
      toast.error("Could not add section", errMsg(err));
    }
  }

  function askDelete(cs: ClassSection) {
    const reason = sectionInUse(cs.id);
    if (reason) toast.error(`Can't delete Section ${cs.section}`, reason);
    else setDeleting(cs);
  }

  const studentCount = (cs: ClassSection) =>
    students.filter((s) => s.classGroup === cs.classGroup && s.shift === cs.shift && s.section === cs.section).length;
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Unknown subject";

  return (
    <Card className="xl:col-span-2">
      <div ref={cardRef} id="timetable" className="scroll-mt-24" />
      <CardHeader
        title="Classes & Timetable"
        subtitle="Pick a class group and shift, manage its sections, then tick which subjects are taught on each class day."
      />
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
          <Select
            aria-label="Class group"
            value={selection.group}
            onChange={(e) => select({ group: e.target.value, shift: selection.shift, sectionId: "" })}
            options={settings.classGroups.map((g) => ({ value: g, label: g }))}
          />
          <Select
            aria-label="Shift"
            value={selection.shift}
            onChange={(e) => select({ group: selection.group, shift: e.target.value, sectionId: "" })}
            options={settings.shifts.map((s) => ({ value: s, label: s }))}
          />
        </div>

        {/* Section tabs */}
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Sections">
          {comboSections.map((cs) => {
            const active = cs.id === current?.id;
            const complete = scheduleIssues(cs.schedule, days, subjects).length === 0;
            return (
              <button
                key={cs.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => !active && select({ ...selection, sectionId: cs.id })}
                className={cn(
                  "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium transition",
                  active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300",
                )}
              >
                Section {cs.section}
                <span className={cn("text-xs", active ? "text-indigo-100" : "text-slate-400")}>{studentCount(cs)} students</span>
                {complete ? (
                  <CheckCircleIcon width={14} height={14} className={active ? "text-white" : "text-emerald-500"} />
                ) : (
                  <AlertIcon width={14} height={14} className={active ? "text-amber-200" : "text-amber-500"} />
                )}
              </button>
            );
          })}
          <Button variant="secondary" size="sm" onClick={handleAddSection} className="h-9">
            <PlusIcon width={14} height={14} /> Add section
          </Button>
        </div>

        {!current ? (
          <p className="rounded-[10px] border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
            This class has no sections yet. Click “Add section”.
          </p>
        ) : days.length === 0 ? (
          <p className="flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
            &quot;{selection.group}&quot; has no weekday names, so no timetable can be built. Name class groups after their days, e.g.
            &quot;Wed-Thu&quot;.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* Builder grid */}
            <div>
              <div className="overflow-x-auto rounded-[10px] border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Subject</th>
                      {days.map((d) => (
                        <th key={d} className="px-3 py-2 text-center text-xs font-semibold text-slate-700">
                          {dayName(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subjects.map((sub) => {
                      const count = days.filter((d) => schedule[d]?.includes(sub.id)).length;
                      return (
                        <tr key={sub.id} className={cn(count !== 1 && "bg-amber-50/40")}>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{sub.name}</td>
                          {days.map((d) => {
                            const checked = !!schedule[d]?.includes(sub.id);
                            return (
                              <td key={d} className="px-3 py-2.5 text-center">
                                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 transition hover:bg-indigo-50">
                                  <input
                                    type="checkbox"
                                    className="peer sr-only"
                                    checked={checked}
                                    onChange={() => toggle(d, sub.id)}
                                    aria-label={`${sub.name} on ${dayName(d)}`}
                                  />
                                  <span
                                    className={cn(
                                      "flex h-5 w-5 items-center justify-center rounded border transition peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40",
                                      checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white",
                                    )}
                                  >
                                    {checked && <CheckIcon width={13} height={13} strokeWidth={3} />}
                                  </span>
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {issues.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {issues.map((msg) => (
                    <li key={msg} className="flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertIcon width={13} height={13} className="mt-0.5 shrink-0" /> {msg}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircleIcon width={13} height={13} /> Every subject is scheduled exactly once.
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button onClick={handleSave} disabled={!dirty || issues.length > 0}>
                  <CheckIcon width={16} height={16} /> Save timetable
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={!dirty}>
                  <RotateIcon width={16} height={16} /> Undo changes
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setDraft({ id: current.id, schedule: {} })}
                  disabled={!Object.values(schedule).some((l) => l.length)}
                >
                  Clear
                </Button>
                <Button variant="ghost" onClick={() => askDelete(current)} className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700">
                  <TrashIcon width={16} height={16} /> Delete Section {current.section}
                </Button>
              </div>
              {dirty && <p className="mt-2 text-xs font-medium text-amber-600">Unsaved timetable changes</p>}
            </div>

            {/* Live preview */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <CalendarIcon width={14} height={14} /> Week preview
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">{sectionLabel(current)}</p>
              <div className="mt-3 space-y-2">
                {days.map((d) => {
                  const list = schedule[d] ?? [];
                  return (
                    <div key={d} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold text-slate-700">{dayName(d)}</p>
                      <p className={cn("mt-0.5 text-sm", list.length ? "text-slate-900" : "text-slate-400")}>
                        {list.length ? list.map(subjectName).join(" + ") : "No subjects"}
                      </p>
                    </div>
                  );
                })}
              </div>
              {!hasTimetable(current) && !dirty && (
                <p className="mt-3 text-xs text-slate-500">No timetable saved yet — teachers can&apos;t take attendance until it is.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={pendingSwitch !== null}
        title="Discard timetable changes?"
        message="You have unsaved changes to this section's timetable. Switching will discard them."
        confirmLabel="Discard changes"
        onConfirm={() => {
          if (pendingSwitch) {
            setDraft(null);
            setSelection(pendingSwitch);
          }
          setPendingSwitch(null);
        }}
        onCancel={() => setPendingSwitch(null)}
      />
      <ConfirmModal
        open={deleting !== null}
        title={`Delete Section ${deleting?.section}?`}
        message={`${deleting ? sectionLabel(deleting) : ""} and its timetable will be removed. It has no students, teachers or records.`}
        confirmLabel="Delete section"
        onConfirm={() => {
          if (deleting) {
            try {
              deleteSection(deleting.id);
              setDraft(null);
              setSelection({ ...selection, sectionId: "" });
              toast.success("Section deleted", sectionLabel(deleting));
            } catch (err) {
              toast.error("Could not delete section", errMsg(err));
            }
          }
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}
