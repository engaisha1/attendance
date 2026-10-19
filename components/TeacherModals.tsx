"use client";

import { useState, type FormEvent } from "react";
import { useAppData } from "@/lib/hooks";
import { addTeacher, isUsernameTaken, resetPassword, updateTeacher } from "@/lib/storage";
import type { ClassSection, SessionRef, User } from "@/lib/types";
import { WEEK_ORDER, cn, groupDays, hasTimetable, sectionShort } from "@/lib/utils";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { CheckIcon } from "./icons";
import { Button, Field, inputClass } from "./ui";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,30}$/;
const MIN_PASSWORD = 4;
const keyOf = (a: SessionRef) => `${a.classSectionId}|${a.subjectId}`;
const errorRing = (on: boolean) => (on ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : "");

/** Sections in a stable, readable order: by first weekday, then shift, then section. */
export function sortSections(list: ClassSection[]): ClassSection[] {
  const dayIndex = (cs: ClassSection) => {
    const first = groupDays(cs.classGroup)[0];
    return first ? WEEK_ORDER.indexOf(first) : 99;
  };
  return [...list].sort(
    (a, b) =>
      dayIndex(a) - dayIndex(b) ||
      a.classGroup.localeCompare(b.classGroup) ||
      a.shift.localeCompare(b.shift) ||
      a.section.localeCompare(b.section),
  );
}

/** Mount only while open so the form starts fresh. */
export function TeacherFormModal({ teacher, onClose }: { teacher?: User; onClose: () => void }) {
  const { sections, subjects, users } = useAppData();
  const toast = useToast();
  const [name, setName] = useState(teacher?.name ?? "");
  const [username, setUsername] = useState(teacher?.username ?? "");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(teacher?.assignedSessions.map(keyOf)));
  const [submitted, setSubmitted] = useState(false);

  const rows = sortSections(sections);
  const others = users.filter((u) => u.role === "teacher" && u.id !== teacher?.id);
  const otherTeachers = (ref: SessionRef) =>
    others.filter((u) => u.assignedSessions.some((a) => keyOf(a) === keyOf(ref))).map((u) => u.name.split(" ")[0]);

  const errors = {
    name: !name.trim() ? "Full name is required." : "",
    username: !username.trim()
      ? "Username is required."
      : !USERNAME_RE.test(username.trim())
        ? "3–30 characters: letters, numbers, dot, dash or underscore."
        : isUsernameTaken(username, teacher?.id)
          ? "This username is already taken."
          : "",
    password: teacher ? "" : password.length < MIN_PASSWORD ? `Password must be at least ${MIN_PASSWORD} characters.` : "",
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : "");

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  function toggleColumn(subjectId: string) {
    const keys = rows.map((cs) => keyOf({ classSectionId: cs.id, subjectId }));
    const allOn = keys.every((k) => selected.has(k));
    const next = new Set(selected);
    keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
    setSelected(next);
  }

  const chosen: SessionRef[] = rows.flatMap((cs) =>
    subjects.filter((sub) => selected.has(`${cs.id}|${sub.id}`)).map((sub) => ({ classSectionId: cs.id, subjectId: sub.id })),
  );
  const chosenSubjects = subjects.filter((sub) => chosen.some((c) => c.subjectId === sub.id));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.name || errors.username || errors.password) return;
    try {
      const saved = teacher
        ? updateTeacher(teacher.id, { name, username, assignedSessions: chosen })
        : addTeacher({ name, username, password, assignedSessions: chosen });
      toast.success(
        teacher ? "Teacher updated" : "Teacher added",
        `${saved.name} · ${chosen.length} session${chosen.length === 1 ? "" : "s"}`,
      );
      onClose();
    } catch (err) {
      toast.error("Could not save teacher", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={teacher ? "Edit teacher" : "Add teacher"}
      description={teacher ? "Use “Reset password” in the table to change their password." : "The teacher signs in with this username and password."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="teacher-form">
            {teacher ? "Save changes" : "Add teacher"}
          </Button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="Full name" htmlFor="tf-name" required error={show("name")}>
          <input
            id="tf-name"
            className={cn(inputClass, errorRing(!!show("name")))}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hodan Warsame"
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username" htmlFor="tf-username" required error={show("username")} hint="Must be unique.">
            <input
              id="tf-username"
              className={cn(inputClass, errorRing(!!show("username")))}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. hodan"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
          {!teacher && (
            <Field label="Password" htmlFor="tf-password" required error={show("password")} hint={`At least ${MIN_PASSWORD} characters.`}>
              <input
                id="tf-password"
                type="password"
                className={cn(inputClass, errorRing(!!show("password")))}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          )}
        </div>

        <fieldset>
          <legend className="mb-1 text-xs font-medium text-slate-700">
            Teaching assignments <span className="font-normal text-slate-400">· {chosen.length} session{chosen.length === 1 ? "" : "s"} selected</span>
          </legend>
          <p className="mb-2 text-xs text-slate-400">Tick the subject this teacher teaches in each class section. Click a subject heading to tick the whole column.</p>
          {rows.length === 0 || subjects.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
              Add subjects and class sections in Settings first.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[10px] border border-slate-200">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Class section</th>
                    {subjects.map((sub) => (
                      <th key={sub.id} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleColumn(sub.id)}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
                          title={`Tick ${sub.name} for every section`}
                        >
                          {sub.name}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((cs) => (
                    <tr key={cs.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium whitespace-nowrap text-slate-800">{sectionShort(cs)}</p>
                        {!hasTimetable(cs) && <p className="text-[11px] text-amber-600">No timetable yet</p>}
                      </td>
                      {subjects.map((sub) => {
                        const ref = { classSectionId: cs.id, subjectId: sub.id };
                        const key = keyOf(ref);
                        const checked = selected.has(key);
                        const taken = otherTeachers(ref);
                        return (
                          <td key={sub.id} className="px-2 py-2 text-center">
                            <label
                              className={cn(
                                "inline-flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition",
                                checked ? "bg-indigo-50" : "hover:bg-slate-50",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={checked}
                                onChange={() => toggle(key)}
                                aria-label={`${sub.name} for ${sectionShort(cs)}`}
                              />
                              <span
                                className={cn(
                                  "flex h-5 w-5 items-center justify-center rounded border transition peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/40",
                                  checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white",
                                )}
                              >
                                {checked && <CheckIcon width={13} height={13} strokeWidth={3} />}
                              </span>
                              {taken.length > 0 && (
                                <span className="max-w-[90px] truncate text-[10px] text-slate-400" title={`Also assigned: ${taken.join(", ")}`}>
                                  {taken.join(", ")}
                                </span>
                              )}
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {chosen.length === 0 && rows.length > 0 ? (
            <p className="mt-2 text-xs text-amber-600">Without an assignment this teacher can sign in but cannot take attendance.</p>
          ) : chosenSubjects.length > 1 ? (
            <p className="mt-2 text-xs text-slate-500">
              Teaches {chosenSubjects.length} subjects ({chosenSubjects.map((s) => s.name).join(", ")}). That&apos;s allowed, but
              teachers usually cover one subject.
            </p>
          ) : null}
        </fieldset>
      </form>
    </Modal>
  );
}

export function ResetPasswordModal({ teacher, onClose }: { teacher: User; onClose: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    password: password.length < MIN_PASSWORD ? `Password must be at least ${MIN_PASSWORD} characters.` : "",
    confirm: confirm !== password ? "Passwords do not match." : "",
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.password || errors.confirm) return;
    try {
      resetPassword(teacher.id, password);
      toast.success("Password reset", `Share the new password with ${teacher.name}.`);
      onClose();
    } catch (err) {
      toast.error("Could not reset password", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password"
      description={`Set a new password for ${teacher.name} (@${teacher.username}).`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="reset-form">
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field label="New password" htmlFor="rp-new" required error={submitted ? errors.password : ""}>
          <input
            id="rp-new"
            type="password"
            autoComplete="new-password"
            className={cn(inputClass, errorRing(submitted && !!errors.password))}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="rp-confirm" required error={submitted ? errors.confirm : ""}>
          <input
            id="rp-confirm"
            type="password"
            autoComplete="new-password"
            className={cn(inputClass, errorRing(submitted && !!errors.confirm))}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
