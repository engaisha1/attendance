"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useAppData } from "@/lib/hooks";
import { addStudents } from "@/lib/storage";
import type { StudentInput } from "@/lib/types";
import { cn, downloadFile, isValidISODate, normalizePhone, parseCSV, sectionLabel, todayISO, toCSV } from "@/lib/utils";
import { Modal } from "./Modal";
import { sortSections } from "./TeacherModals";
import { useToast } from "./Toast";
import { AlertIcon, CheckCircleIcon, DownloadIcon, FileIcon, UploadIcon } from "./icons";
import { Button, Field, Select, inputClass } from "./ui";

const TEMPLATE = toCSV([
  ["fullName", "phone", "email", "notes", "joinedAt"],
  ["Amina Hassan", "612 000 111", "amina@example.com", "Class representative", todayISO()],
  ["Mohamed Ali", "615 222 333", "", "", ""],
]);

/** Header aliases → field. Unknown columns are ignored. */
const HEADERS: Record<string, keyof Row> = {
  fullname: "fullName",
  name: "fullName",
  "full name": "fullName",
  student: "fullName",
  "student name": "fullName",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  tel: "phone",
  telephone: "phone",
  email: "email",
  "e-mail": "email",
  notes: "notes",
  note: "notes",
  joinedat: "joinedAt",
  joined: "joinedAt",
  "joined at": "joinedAt",
  "join date": "joinedAt",
};

interface Row {
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  joinedAt: string;
}

interface Checked extends Row {
  line: number;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkRows(text: string, existingPhones: Set<string>): Checked[] {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  // Use the header row if it names any known column; otherwise assume name, phone, email, notes.
  const header = rows[0].map((h) => HEADERS[h.toLowerCase().replace(/[_\s]+/g, " ").trim()] ?? HEADERS[h.toLowerCase()]);
  const hasHeader = header.some(Boolean);
  const columns: (keyof Row | undefined)[] = hasHeader ? header : ["fullName", "phone", "email", "notes", "joinedAt"];
  const seen = new Set<string>();
  return rows.slice(hasHeader ? 1 : 0).map((cells, i) => {
    const row: Row = { fullName: "", phone: "", email: "", notes: "", joinedAt: "" };
    columns.forEach((col, c) => {
      if (col) row[col] = cells[c] ?? "";
    });
    const phone = normalizePhone(row.phone);
    const digits = phone.replace(/\D/g, "");
    let error: string | undefined;
    if (!row.fullName) error = "Missing name";
    else if (!row.phone) error = "Missing phone";
    else if (digits.length < 6 || digits.length > 15) error = "Invalid phone";
    else if (existingPhones.has(phone)) error = "Duplicate phone (already a student)";
    else if (seen.has(phone)) error = "Duplicate phone (earlier in this file)";
    else if (row.email && !EMAIL_RE.test(row.email)) error = "Invalid email";
    else if (row.joinedAt && !isValidISODate(row.joinedAt)) error = "Joined date must be YYYY-MM-DD";
    if (!error) seen.add(phone);
    return { ...row, line: i + (hasHeader ? 2 : 1), error };
  });
}

/** Mount only while open so state starts fresh. */
export function StudentImportModal({ onClose }: { onClose: () => void }) {
  const { sections, students } = useAppData();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const sorted = sortSections(sections);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [sectionId, setSectionId] = useState(sorted[0]?.id ?? "");

  const checked = useMemo(
    () => checkRows(text, new Set(students.map((s) => normalizePhone(s.phone)))),
    [text, students],
  );
  const valid = checked.filter((r) => !r.error);
  const invalid = checked.filter((r) => r.error);
  const cs = sections.find((s) => s.id === sectionId);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setText(await file.text());
    setFileName(file.name);
  }

  function handleImport() {
    if (!cs || valid.length === 0) return;
    const inputs: StudentInput[] = valid.map((r) => ({
      fullName: r.fullName,
      phone: r.phone,
      email: r.email || undefined,
      notes: r.notes || undefined,
      classGroup: cs.classGroup,
      shift: cs.shift,
      section: cs.section,
      status: "active",
      joinedAt: r.joinedAt || todayISO(),
    }));
    try {
      const created = addStudents(inputs);
      toast.success(
        `${created.length} student${created.length === 1 ? "" : "s"} imported`,
        `${sectionLabel(cs)}${invalid.length ? ` · ${invalid.length} row${invalid.length === 1 ? "" : "s"} skipped` : ""}`,
      );
      onClose();
    } catch (err) {
      toast.error("Import failed", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Import students from CSV"
      description="Columns: fullName, phone, email (optional), notes (optional), joinedAt (optional, YYYY-MM-DD)."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!cs || valid.length === 0}>
            <UploadIcon width={16} height={16} /> Import {valid.length} student{valid.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              downloadFile("students-template.csv", TEMPLATE, "text/csv;charset=utf-8");
              toast.success("Template downloaded", "students-template.csv");
            }}
          >
            <DownloadIcon width={14} height={14} /> Download Template
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <FileIcon width={14} height={14} /> Choose CSV file
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} aria-label="CSV file" />
          {fileName && <span className="truncate text-xs text-slate-500">Loaded {fileName}</span>}
        </div>

        <Field label="…or paste CSV rows" htmlFor="csv-paste">
          <textarea
            id="csv-paste"
            rows={5}
            spellCheck={false}
            className={cn(inputClass, "h-auto py-2 font-mono text-xs")}
            placeholder={"fullName,phone,email\nAmina Hassan,612 000 111,amina@example.com"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName("");
            }}
          />
        </Field>

        <Field label="Import into section" htmlFor="csv-section" required hint="All imported students join this class section.">
          <Select
            id="csv-section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            options={sorted.map((s) => ({ value: s.id, label: sectionLabel(s) }))}
          />
        </Field>

        {checked.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs font-medium">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                <CheckCircleIcon width={12} height={12} /> {valid.length} valid
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                <AlertIcon width={12} height={12} /> {invalid.length} with errors
              </span>
            </div>
            {valid.length > 0 && (
              <PreviewTable
                title="Will be imported"
                rows={valid}
                tone="ok"
                render={(r) => (
                  <>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{r.fullName}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600 tabular-nums">{r.phone}</td>
                    <td className="px-3 py-1.5 text-slate-500">{r.email || "—"}</td>
                  </>
                )}
              />
            )}
            {invalid.length > 0 && (
              <PreviewTable
                title="Skipped — fix these rows and paste again"
                rows={invalid}
                tone="error"
                render={(r) => (
                  <>
                    <td className="px-3 py-1.5 text-slate-700">{r.fullName || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-600 tabular-nums">{r.phone || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-1.5 font-medium text-red-600">{r.error}</td>
                  </>
                )}
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function PreviewTable({
  title,
  rows,
  tone,
  render,
}: {
  title: string;
  rows: Checked[];
  tone: "ok" | "error";
  render: (r: Checked) => ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[10px] border", tone === "ok" ? "border-emerald-200" : "border-red-200")}>
      <p className={cn("px-3 py-1.5 text-xs font-semibold", tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
        {title}
      </p>
      <div className="max-h-48 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white text-left text-slate-400">
            <tr>
              <th className="px-3 py-1.5 font-medium">Row</th>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Phone</th>
              <th className="px-3 py-1.5 font-medium">{tone === "ok" ? "Email" : "Problem"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.line}>
                <td className="px-3 py-1.5 text-slate-400 tabular-nums">{r.line}</td>
                {render(r)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
