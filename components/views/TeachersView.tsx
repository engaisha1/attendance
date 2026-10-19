"use client";

import { useState, type ReactNode } from "react";
import { useAppData } from "@/lib/hooks";
import { deleteTeacher, restoreTeacher, setUserActive } from "@/lib/storage";
import type { User } from "@/lib/types";
import { cn, formatDate, sectionShort, toISODate } from "@/lib/utils";
import { Avatar } from "../AppShell";
import { ConfirmModal } from "../Modal";
import { ResetPasswordModal, TeacherFormModal } from "../TeacherModals";
import { useToast } from "../Toast";
import { KeyIcon, PencilIcon, PlusIcon, PowerIcon, TeacherIcon, TrashIcon } from "../icons";
import { Button, Card, EmptyState, PageLoading } from "../ui";

export function TeachersView() {
  const { users, attendance, sections, subjects, ready } = useAppData();
  const toast = useToast();
  const [form, setForm] = useState<{ teacher?: User } | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  if (!ready) return <PageLoading />;

  const teachers = users.filter((u) => u.role === "teacher").sort((a, b) => a.name.localeCompare(b.name));
  const activeCount = teachers.filter((t) => t.active).length;
  const recordsBy = (id: string) => attendance.filter((r) => r.recordedById === id).length;
  /** Assignments grouped by subject: [{ subject, sections }] in subject order. */
  const assignmentsOf = (t: User) =>
    subjects
      .map((sub) => ({
        sub,
        sections: t.assignedSessions
          .filter((a) => a.subjectId === sub.id)
          .map((a) => sections.find((cs) => cs.id === a.classSectionId))
          .filter((cs) => cs !== undefined),
      }))
      .filter((g) => g.sections.length > 0);

  function toggleActive(t: User) {
    try {
      setUserActive(t.id, !t.active);
      toast.success(t.active ? "Teacher deactivated" : "Teacher activated", t.active ? `${t.name} can no longer sign in.` : `${t.name} can sign in again.`);
    } catch (err) {
      toast.error("Could not update teacher", err instanceof Error ? err.message : String(err));
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    try {
      const removed = deleteTeacher(deleting.id);
      toast.success("Teacher deleted", removed.name, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            try {
              restoreTeacher(removed);
              toast.success("Teacher restored", removed.name);
            } catch (err) {
              toast.error("Could not restore teacher", err instanceof Error ? err.message : String(err));
            }
          },
        },
      });
    } catch (err) {
      toast.error("Could not delete teacher", err instanceof Error ? err.message : String(err));
    }
    setDeleting(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{teachers.length}</span> teacher{teachers.length === 1 ? "" : "s"} · {activeCount}{" "}
          active
        </p>
        <Button onClick={() => setForm({})}>
          <PlusIcon width={16} height={16} /> Add Teacher
        </Button>
      </div>

      {teachers.length === 0 ? (
        <Card>
          <EmptyState
            className="py-20"
            icon={<TeacherIcon />}
            title="No teachers yet"
            hint="Create teacher accounts and assign each one a subject per class section. Teachers can only take attendance for their own sessions."
            action={
              <Button onClick={() => setForm({})}>
                <PlusIcon width={16} height={16} /> Add your first teacher
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Assigned sessions</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((t) => (
                  <tr key={t.id} className={cn("transition-colors hover:bg-slate-50/80", !t.active && "bg-slate-50/50")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={cn(!t.active && "opacity-50")}>
                          <Avatar name={t.name} small />
                        </span>
                        <div>
                          <p className={cn("font-medium", t.active ? "text-slate-900" : "text-slate-500")}>{t.name}</p>
                          <p className="text-xs text-slate-400">{recordsBy(t.id)} marks recorded</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">@{t.username}</td>
                    <td className="px-4 py-3">
                      {t.assignedSessions.length === 0 ? (
                        <span className="text-xs text-amber-600">No sessions assigned</span>
                      ) : (
                        <div className="max-w-sm space-y-1.5">
                          {assignmentsOf(t).map(({ sub, sections: list }) => (
                            <div key={sub.id} className="flex flex-wrap items-center gap-1">
                              <span className="rounded-md bg-indigo-600 px-1.5 py-0.5 text-xs font-medium text-white">{sub.name}</span>
                              {list.map((cs) => (
                                <span
                                  key={cs.id}
                                  className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/15 ring-inset"
                                >
                                  {sectionShort(cs)}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          t.active ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-500 ring-slate-500/20",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", t.active ? "bg-emerald-500" : "bg-slate-400")} />
                        {t.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(toISODate(new Date(t.createdAt)))}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <RowAction target={t.name} label="Edit" onClick={() => setForm({ teacher: t })}>
                          <PencilIcon width={16} height={16} />
                        </RowAction>
                        <RowAction target={t.name} label={t.active ? "Deactivate" : "Activate"} onClick={() => toggleActive(t)} tone={t.active ? "amber" : "emerald"}>
                          <PowerIcon width={16} height={16} />
                        </RowAction>
                        <RowAction target={t.name} label="Reset password" onClick={() => setResetting(t)}>
                          <KeyIcon width={16} height={16} />
                        </RowAction>
                        <RowAction target={t.name} label="Delete" onClick={() => setDeleting(t)} tone="red">
                          <TrashIcon width={16} height={16} />
                        </RowAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {form && <TeacherFormModal teacher={form.teacher} onClose={() => setForm(null)} />}
      {resetting && <ResetPasswordModal teacher={resetting} onClose={() => setResetting(null)} />}
      <ConfirmModal
        open={deleting !== null}
        title="Delete teacher?"
        message={
          <>
            <strong className="text-slate-900">{deleting?.name}</strong>&apos;s account will be removed and they will no longer be
            able to sign in. You can undo this for a few seconds. Attendance they recorded is kept and still shows their name.
          </>
        }
        confirmLabel="Delete teacher"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function RowAction({
  label,
  target,
  onClick,
  tone,
  children,
}: {
  label: string;
  target: string;
  onClick: () => void;
  tone?: "red" | "amber" | "emerald";
  children: ReactNode;
}) {
  const hover = {
    red: "hover:bg-red-50 hover:text-red-600",
    amber: "hover:bg-amber-50 hover:text-amber-600",
    emerald: "hover:bg-emerald-50 hover:text-emerald-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} ${target}`}
      title={label}
      className={cn("rounded-lg p-2 text-slate-400 transition-colors", tone ? hover[tone] : "hover:bg-slate-100 hover:text-slate-700")}
    >
      {children}
    </button>
  );
}
