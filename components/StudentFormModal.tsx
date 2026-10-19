"use client";

import { useState, type FormEvent } from "react";
import { addStudent, isPhoneTaken, updateStudent } from "@/lib/storage";
import { useAppData } from "@/lib/hooks";
import type { Student, StudentInput } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { Modal } from "./Modal";
import { useToast } from "./Toast";
import { Button, Field, Select, inputClass } from "./ui";

type Errors = Partial<Record<keyof StudentInput, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: StudentInput, editingId?: string): Errors {
  const e: Errors = {};
  if (!v.fullName.trim()) e.fullName = "Full name is required.";
  else if (v.fullName.trim().length < 2) e.fullName = "Name must be at least 2 characters.";

  const digits = v.phone.replace(/\D/g, "");
  if (!v.phone.trim()) e.phone = "Phone number is required.";
  else if (!/^\+?[\d\s\-()]+$/.test(v.phone.trim()) || digits.length < 6 || digits.length > 15)
    e.phone = "Enter a valid phone number (6–15 digits).";
  else if (isPhoneTaken(v.phone, editingId)) e.phone = "Another student already uses this phone number.";

  if (v.email?.trim() && !EMAIL_RE.test(v.email.trim())) e.email = "Enter a valid email address.";
  if (!v.classGroup) e.classGroup = "Choose a class group.";
  if (!v.shift) e.shift = "Choose a shift.";
  else if (!v.section) e.section = "Choose a section.";
  if (!v.joinedAt) e.joinedAt = "Choose a join date.";
  return e;
}

interface Props {
  /** Student to edit; omit to create a new one. */
  student?: Student;
  /** Pre-selected class group / shift for a new student. */
  defaults?: { classGroup?: string; shift?: string; section?: string };
  onClose: () => void;
  onSaved?: (student: Student) => void;
}

/** Mount only while open so the form state starts fresh each time. */
export function StudentFormModal({ student, defaults, onClose, onSaved }: Props) {
  const { settings, sections } = useAppData();
  const sectionsFor = (group: string, shift: string) =>
    sections.filter((s) => s.classGroup === group && s.shift === shift).map((s) => s.section).sort();
  const toast = useToast();
  const [values, setValues] = useState<StudentInput>(() => ({
    fullName: student?.fullName ?? "",
    phone: student?.phone ?? "",
    email: student?.email ?? "",
    classGroup: student?.classGroup ?? defaults?.classGroup ?? "",
    shift: student?.shift ?? defaults?.shift ?? "",
    section: student?.section ?? defaults?.section ?? "A",
    status: student?.status ?? "active",
    joinedAt: student?.joinedAt ?? todayISO(),
    notes: student?.notes ?? "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  const set = <K extends keyof StudentInput>(key: K, value: StudentInput[K]) => {
    const next = { ...values, [key]: value };
    // Switching class group or shift: keep the section only if it exists there.
    if (key === "classGroup" || key === "shift") {
      const available = sectionsFor(next.classGroup, next.shift);
      if (!available.includes(next.section)) next.section = available[0] ?? "";
    }
    setValues(next);
    if (submitted) setErrors(validate(next, student?.id));
  };

  // Keep a value that was removed from settings selectable for existing students.
  const groupOptions = [...new Set([...settings.classGroups, ...(student ? [student.classGroup] : [])])];
  const shiftOptions = [...new Set([...settings.shifts, ...(student ? [student.shift] : [])])];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const found = validate(values, student?.id);
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      const saved = student ? updateStudent(student.id, values) : addStudent(values);
      toast.success(student ? "Student updated" : "Student added", saved.fullName);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error("Could not save student", err instanceof Error ? err.message : String(err));
    }
  }

  const err = (k: keyof StudentInput) => (errors[k] ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : "");

  return (
    <Modal
      open
      onClose={onClose}
      title={student ? "Edit student" : "Add student"}
      description={student ? `Update ${student.fullName}'s details.` : "Fields marked * are required."}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="student-form">
            {student ? "Save changes" : "Add student"}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="sf-name" required error={errors.fullName} className="sm:col-span-2">
          <input
            id="sf-name"
            className={cn(inputClass, err("fullName"))}
            value={values.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="e.g. Amina Hassan"
            autoComplete="off"
          />
        </Field>
        <Field label="Phone" htmlFor="sf-phone" required error={errors.phone} hint="Must be unique. Spaces are ignored.">
          <input
            id="sf-phone"
            inputMode="tel"
            className={cn(inputClass, err("phone"))}
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="e.g. 612 216 255"
            autoComplete="off"
          />
        </Field>
        <Field label="Email" htmlFor="sf-email" error={errors.email} hint="Optional">
          <input
            id="sf-email"
            type="email"
            className={cn(inputClass, err("email"))}
            value={values.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
            placeholder="name@example.com"
            autoComplete="off"
          />
        </Field>
        <Field label="Class group" htmlFor="sf-group" required error={errors.classGroup}>
          <Select
            id="sf-group"
            className={err("classGroup")}
            value={values.classGroup}
            onChange={(e) => set("classGroup", e.target.value)}
            options={[{ value: "", label: "Select a class group" }, ...groupOptions.map((g) => ({ value: g, label: g }))]}
          />
        </Field>
        <Field label="Shift" htmlFor="sf-shift" required error={errors.shift}>
          <Select
            id="sf-shift"
            className={err("shift")}
            value={values.shift}
            onChange={(e) => set("shift", e.target.value)}
            options={[{ value: "", label: "Select a shift" }, ...shiftOptions.map((s) => ({ value: s, label: s }))]}
          />
        </Field>
        <Field label="Section" htmlFor="sf-section" required error={errors.section} hint="Sections are managed in Settings.">
          <Select
            id="sf-section"
            className={err("section")}
            value={values.section}
            disabled={!values.classGroup || !values.shift}
            onChange={(e) => set("section", e.target.value)}
            options={[
              { value: "", label: values.classGroup && values.shift ? "Select a section" : "Pick class group and shift first" },
              ...sectionsFor(values.classGroup, values.shift).map((s) => ({ value: s, label: `Section ${s}` })),
            ]}
          />
        </Field>
        <Field label="Status" htmlFor="sf-status">
          <Select
            id="sf-status"
            value={values.status}
            onChange={(e) => set("status", e.target.value as StudentInput["status"])}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </Field>
        <Field label="Joined on" htmlFor="sf-joined" required error={errors.joinedAt}>
          <input
            id="sf-joined"
            type="date"
            className={cn(inputClass, err("joinedAt"))}
            value={values.joinedAt}
            max={todayISO()}
            onChange={(e) => set("joinedAt", e.target.value)}
          />
        </Field>
        <Field label="Notes" htmlFor="sf-notes" hint="Optional" className="sm:col-span-2">
          <textarea
            id="sf-notes"
            rows={3}
            className={cn(inputClass, "h-auto py-2")}
            value={values.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Anything worth remembering about this student"
          />
        </Field>
      </form>
    </Modal>
  );
}
