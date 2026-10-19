"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useAppData, useDebounced } from "@/lib/hooks";
import { deleteStudent, restoreStudent } from "@/lib/storage";
import type { Student } from "@/lib/types";
import { attendanceRate, cn, countStatuses, formatDate, formatRate, normalizePhone, rateColor } from "@/lib/utils";
import { ConfirmModal } from "../Modal";
import { SkeletonRows } from "../Polish";
import { StudentImportModal } from "../StudentImportModal";
import { StudentFormModal } from "../StudentFormModal";
import { StudentProfile, initials } from "../StudentProfile";
import { useToast } from "../Toast";
import { EyeIcon, FilterIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon, UsersIcon } from "../icons";
import { Button, ButtonLink, Card, EmptyState, PageLoading, Select, StudentStatusBadge, inputClass } from "../ui";

type StatusFilter = "all" | "active" | "inactive";

export function StudentsView() {
  const { settings, students, attendance, ready } = useAppData();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const [group, setGroup] = useState("all");
  const [shift, setShift] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const [form, setForm] = useState<{ student?: Student } | null>(null);
  const [localViewingId, setViewingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // Profiles can be opened by link (?view=<id>) from the dashboard or the command palette.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const linkedId = params.get("view");
  const viewingId = localViewingId ?? linkedId;
  const closeProfile = () => {
    setViewingId(null);
    if (linkedId) router.replace(pathname, { scroll: false });
  };
  const [deleting, setDeleting] = useState<Student | null>(null);

  const rates = useMemo(() => {
    const byStudent = new Map<string, typeof attendance>();
    for (const r of attendance) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
    return new Map([...byStudent].map(([id, recs]) => [id, attendanceRate(countStatuses(recs))]));
  }, [attendance]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const qPhone = normalizePhone(q);
    return students
      .filter((s) => {
        if (group !== "all" && s.classGroup !== group) return false;
        if (shift !== "all" && s.shift !== shift) return false;
        if (status !== "all" && s.status !== status) return false;
        if (!q) return true;
        return s.fullName.toLowerCase().includes(q) || (qPhone !== "" && normalizePhone(s.phone).includes(qPhone));
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, debouncedQuery, group, shift, status]);

  if (!ready) return <PageLoading />;

  const hasFilters = query !== "" || group !== "all" || shift !== "all" || status !== "all";
  const clearFilters = () => {
    setQuery("");
    setGroup("all");
    setShift("all");
    setStatus("all");
  };

  // Groups/shifts still used by students but removed from settings stay filterable.
  const groupOptions = [...new Set([...settings.classGroups, ...students.map((s) => s.classGroup)])];
  const shiftOptions = [...new Set([...settings.shifts, ...students.map((s) => s.shift)])];

  function confirmDelete() {
    if (!deleting) return;
    try {
      const snapshot = deleteStudent(deleting.id);
      if (viewingId === deleting.id) closeProfile();
      toast.success("Student deleted", `${snapshot.student.fullName} · ${snapshot.records.length} records`, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            try {
              restoreStudent(snapshot);
              toast.success("Student restored", snapshot.student.fullName);
            } catch (err) {
              toast.error("Could not restore student", err instanceof Error ? err.message : String(err));
            }
          },
        },
      });
    } catch (err) {
      toast.error("Could not delete student", err instanceof Error ? err.message : String(err));
    }
    setDeleting(null);
  }

  const viewing = viewingId ? students.find((s) => s.id === viewingId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{students.length}</span> student{students.length === 1 ? "" : "s"} ·{" "}
          {students.filter((s) => s.status === "active").length} active
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setImporting(true)}>
            <UploadIcon width={16} height={16} /> Import CSV
          </Button>
          <Button onClick={() => setForm({})}>
            <PlusIcon width={16} height={16} /> Add Student
          </Button>
        </div>
      </div>

      {students.length === 0 ? (
        <Card>
          <EmptyState
            className="py-20"
            icon={<UsersIcon />}
            title="No students yet"
            hint="Add students to build class rosters. You can also load demo data from Settings."
            action={
              <>
                <Button onClick={() => setForm({})}>
                  <PlusIcon width={16} height={16} /> Add your first student
                </Button>
                <Button variant="secondary" onClick={() => setImporting(true)}>
                  <UploadIcon width={16} height={16} /> Import CSV
                </Button>
                <ButtonLink href="/settings" variant="ghost">
                  Go to Settings
                </ButtonLink>
              </>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" width={16} height={16} />
              <input
                type="search"
                aria-label="Search by name or phone"
                placeholder="Search by name or phone…"
                className={cn(inputClass, "pl-9")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select
              aria-label="Class group"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              options={[{ value: "all", label: "All class groups" }, ...groupOptions.map((g) => ({ value: g, label: g }))]}
            />
            <Select
              aria-label="Shift"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              options={[{ value: "all", label: "All shifts" }, ...shiftOptions.map((s) => ({ value: s, label: s }))]}
            />
            <Select
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
            <Button variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
              Clear
            </Button>
          </div>

          {query !== debouncedQuery ? (
            <SkeletonRows rows={Math.min(Math.max(filtered.length, 3), 8)} columns={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FilterIcon />}
              title="No students match"
              hint="Try a different name or phone number, or clear the filters."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Class</th>
                    <th className="px-4 py-3 font-medium">Shift</th>
                    <th className="px-4 py-3 font-medium">Section</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((s) => {
                    const rate = rates.get(s.id) ?? null;
                    return (
                      <tr key={s.id} className="transition-colors hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setViewingId(s.id)} className="flex items-center gap-3 text-left">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                              {initials(s.fullName)}
                            </span>
                            <span>
                              <span className="block font-medium text-slate-900 hover:text-indigo-600">{s.fullName}</span>
                              <span className={cn("block text-xs", rateColor(rate))}>{formatRate(rate)} attendance</span>
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700 tabular-nums">{s.phone}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-slate-500">{s.email || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{s.classGroup}</td>
                        <td className="px-4 py-3 text-slate-700">{s.shift}</td>
                        <td className="px-4 py-3 text-slate-700">{s.section}</td>
                        <td className="px-4 py-3">
                          <StudentStatusBadge status={s.status} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(s.joinedAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <IconAction label={`View ${s.fullName}`} onClick={() => setViewingId(s.id)}>
                              <EyeIcon width={16} height={16} />
                            </IconAction>
                            <IconAction label={`Edit ${s.fullName}`} onClick={() => setForm({ student: s })}>
                              <PencilIcon width={16} height={16} />
                            </IconAction>
                            <IconAction label={`Delete ${s.fullName}`} onClick={() => setDeleting(s)} danger>
                              <TrashIcon width={16} height={16} />
                            </IconAction>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">
                Showing {filtered.length} of {students.length}
              </p>
            </div>
          )}
        </Card>
      )}

      {form && <StudentFormModal student={form.student} onClose={() => setForm(null)} />}
      {viewing && !form && !deleting && (
        <StudentProfile
          studentId={viewing.id}
          onClose={closeProfile}
          onEdit={() => setForm({ student: viewing })}
          onDelete={() => setDeleting(viewing)}
        />
      )}
      {importing && <StudentImportModal onClose={() => setImporting(false)} />}
      <ConfirmModal
        open={deleting !== null}
        title="Delete student?"
        message={
          <>
            <strong className="text-slate-900">{deleting?.fullName}</strong> and all of their attendance records will be
            removed. You can undo this for a few seconds.
          </>
        }
        confirmLabel="Delete student"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function IconAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label.split(" ")[0]}
      className={cn(
        "rounded-lg p-2 text-slate-400 transition-colors",
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}
