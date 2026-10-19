"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { downloadBackup } from "@/lib/actions";
import { loadDemoData } from "@/lib/demo";
import { useAppData, useCurrentUser } from "@/lib/hooks";
import {
  ARCHIVE_KEY,
  DEFAULT_PRINCIPAL_PASSWORD,
  STORAGE_KEYS,
  addClassGroup,
  addShift,
  changeOwnPassword,
  eraseAllData,
  getArchive,
  importBackup,
  parseBackup,
  removeClassGroup,
  removeShift,
  updateSettings,
  type ParsedBackup,
} from "@/lib/storage";
import type { Settings, User } from "@/lib/types";
import { cn, downloadFile, relativeTime, todayISO } from "@/lib/utils";
import { SubjectsCard, TimetableCard } from "../ClassSetup";
import { ConfirmModal } from "../Modal";
import { useToast } from "../Toast";
import { AlertIcon, DatabaseIcon, DownloadIcon, KeyIcon, PlusIcon, SparklesIcon, TrashIcon, UploadIcon, XIcon } from "../icons";
import { Button, Card, CardHeader, Field, PageLoading, inputClass } from "../ui";

const EMOJIS = ["🎓", "🏫", "📚", "✏️", "🧠", "🌍", "💡", "🧪", "🖥️", "🎨", "⭐", "🕌"];

type Pending =
  | { kind: "import"; parsed: ParsedBackup; fileName: string }
  | { kind: "demo" }
  | { kind: "erase" };

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function SettingsView() {
  const { settings, students, attendance, flags, ready } = useAppData();
  const { user } = useCurrentUser();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  if (!ready || !user) return <PageLoading />;

  const hasData = students.length > 0 || attendance.length > 0;
  const archived = getArchive();
  const storageKB = (
    [...Object.values(STORAGE_KEYS), ARCHIVE_KEY].reduce((sum, k) => {
      try {
        return sum + (window.localStorage.getItem(k)?.length ?? 0);
      } catch {
        return sum;
      }
    }, 0) / 1024
  ).toFixed(1);

  function handleExport() {
    try {
      toast.success("Backup downloaded", downloadBackup());
    } catch (err) {
      toast.error("Export failed", errMsg(err));
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      setPending({ kind: "import", parsed, fileName: file.name });
    } catch (err) {
      toast.error("Could not read backup", err instanceof SyntaxError ? "The file is not valid JSON." : errMsg(err));
    }
  }

  function runDemo() {
    const demo = loadDemoData();
    toast.success(
      "Demo data loaded",
      `${demo.students} students, ${demo.sections} timetabled sections, ${demo.teachers} teachers (password teacher123), ${demo.records} records.`,
    );
  }

  function confirmPending() {
    if (!pending) return;
    try {
      if (pending.kind === "import") {
        importBackup(pending.parsed);
        const { data, legacyRecords } = pending.parsed;
        toast.success(
          "Backup imported",
          `${data.students.length} students, ${data.attendance.length} records${legacyRecords.length ? `, ${legacyRecords.length} old records archived` : ""}.`,
        );
      } else if (pending.kind === "demo") {
        runDemo();
      } else {
        eraseAllData();
        toast.success("All data erased", "Settings were reset to defaults.");
      }
    } catch (err) {
      toast.error("Something went wrong", errMsg(err));
    }
    setPending(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* key resets the form after imports, demo loads and erases */}
      <ProfileCard key={`${settings.instituteName}|${settings.logoEmoji}`} settings={settings} />
      <AccountCard user={user} />

      <Card>
        <CardHeader title="Class groups & shifts" subtitle="Name class groups after their days (e.g. Sat-Sun) so timetables know the weekdays." />
        <div className="space-y-6 p-5">
          <ListEditor
            label="Class day groups"
            placeholder="e.g. Wed-Thu"
            items={settings.classGroups}
            usage={(g) => students.filter((s) => s.classGroup === g).length}
            onAdd={addClassGroup}
            onRemove={removeClassGroup}
          />
          <ListEditor
            label="Shifts"
            placeholder="e.g. Evening"
            items={settings.shifts}
            usage={(sh) => students.filter((s) => s.shift === sh).length}
            onAdd={addShift}
            onRemove={removeShift}
          />
        </div>
      </Card>

      <SubjectsCard />
      <TimetableCard />

      <Card className="xl:col-span-2">
        <CardHeader title="Data" subtitle="Everything is stored in this browser's localStorage." />
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 md:col-span-3">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-2 text-slate-500">
                <DatabaseIcon width={16} height={16} className="text-indigo-500" /> Storage used
                <strong className="text-slate-900 tabular-nums">{storageKB} KB</strong>
              </span>
              <span className="text-slate-500">
                Last backup{" "}
                <strong className={flags.lastBackupAt ? "text-slate-900" : "text-amber-600"}>
                  {flags.lastBackupAt ? relativeTime(flags.lastBackupAt) : "never"}
                </strong>
              </span>
              <span className="text-slate-500">
                Students <strong className="text-slate-900 tabular-nums">{students.length}</strong>
              </span>
              <span className="text-slate-500">
                Attendance records <strong className="text-slate-900 tabular-nums">{attendance.length}</strong>
              </span>
              {archived.length > 0 && (
                <span className="inline-flex items-center gap-2 text-slate-500">
                  Archived pre-upgrade records <strong className="text-slate-900 tabular-nums">{archived.length}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      const name = `iap-attendance-archive-${todayISO()}.json`;
                      downloadFile(name, JSON.stringify(archived, null, 2), "application/json");
                      toast.success("Archive downloaded", name);
                    }}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Download
                  </button>
                </span>
              )}
            </div>
          </div>

          <DataAction
            title="Backup"
            text="Download settings, subjects, sections, students and attendance as JSON, or restore from one (older backups are upgraded). User accounts are not included."
          >
            <Button variant="secondary" onClick={handleExport}>
              <DownloadIcon width={16} height={16} /> Download Backup
            </Button>
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <UploadIcon width={16} height={16} /> Import
            </Button>
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
          </DataAction>

          <DataAction title="Demo data" text="Seed 3 subjects, 7 timetabled sections (Sat-Sun PM has A and B), 7 subject teachers, 16 students and 14 days of attendance.">
            <Button
              variant="secondary"
              onClick={() => {
                if (hasData) setPending({ kind: "demo" });
                else {
                  try {
                    runDemo();
                  } catch (err) {
                    toast.error("Could not load demo data", errMsg(err));
                  }
                }
              }}
            >
              <SparklesIcon width={16} height={16} /> Load Demo Data
            </Button>
          </DataAction>

          <DataAction title="Danger zone" text="Permanently delete students, attendance, subjects, sections and settings. User accounts and the pre-upgrade archive are kept." danger>
            <Button variant="danger" onClick={() => setPending({ kind: "erase" })}>
              <TrashIcon width={16} height={16} /> Erase All Data
            </Button>
          </DataAction>
        </div>
      </Card>

      <ConfirmModal
        open={pending !== null}
        tone={pending?.kind === "import" ? "primary" : "danger"}
        title={
          pending?.kind === "import" ? "Import this backup?" : pending?.kind === "demo" ? "Replace data with demo?" : "Erase all data?"
        }
        message={
          pending?.kind === "import" ? (
            <>
              <strong className="text-slate-900">{pending.fileName}</strong> contains {pending.parsed.data.students.length} students,{" "}
              {pending.parsed.data.sections.length} sections and {pending.parsed.data.attendance.length} attendance records
              {pending.parsed.legacyRecords.length > 0 && <> (plus {pending.parsed.legacyRecords.length} old records that will be archived)</>}. It will <strong>replace</strong> everything currently stored
              ({students.length} students, {attendance.length} records).
            </>
          ) : pending?.kind === "demo" ? (
            `Your current ${students.length} students and ${attendance.length} attendance records, subjects and timetables will be replaced with demo data. Demo teacher accounts are created or updated (password teacher123). Export a backup first if you want to keep your data.`
          ) : (
            `This permanently deletes ${students.length} students, ${attendance.length} attendance records, all subjects, sections, timetables and settings. Accounts are kept but lose their teaching assignments. This cannot be undone.`
          )
        }
        confirmLabel={pending?.kind === "import" ? "Import & replace" : pending?.kind === "demo" ? "Replace with demo" : "Erase everything"}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function ProfileCard({ settings }: { settings: Settings }) {
  const toast = useToast();
  const [name, setName] = useState(settings.instituteName);
  const [emoji, setEmoji] = useState(settings.logoEmoji);
  const [error, setError] = useState("");
  const dirty = name !== settings.instituteName || emoji !== settings.logoEmoji;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Institute name is required.");
    if (!emoji.trim()) return setError("Pick a logo emoji.");
    try {
      updateSettings({ instituteName: name.trim(), logoEmoji: emoji.trim() });
      toast.success("Institute profile saved");
    } catch (err) {
      toast.error("Could not save", errMsg(err));
    }
  }

  return (
    <Card>
      <CardHeader title="Institute profile" subtitle="Shown in the sidebar and on printed reports." />
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-2xl">{emoji || "?"}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{name || "Institute name"}</p>
            <p className="text-xs text-slate-400">Preview</p>
          </div>
        </div>
        <Field label="Institute name" htmlFor="st-name" required error={error && !name.trim() ? error : undefined}>
          <input
            id="st-name"
            className={inputClass}
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
        </Field>
        <Field
          label="Logo emoji"
          htmlFor="st-emoji"
          required
          hint="Pick one below or type/paste any emoji."
          error={error && name.trim() && !emoji.trim() ? error : undefined}
        >
          <input
            id="st-emoji"
            className={cn(inputClass, "w-24 text-center text-lg")}
            value={emoji}
            maxLength={8}
            onChange={(e) => {
              setEmoji(e.target.value);
              setError("");
            }}
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => setEmoji(em)}
              aria-label={`Use ${em} as logo`}
              aria-pressed={emoji === em}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition",
                emoji === em ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              {em}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button
            variant="ghost"
            disabled={!dirty}
            onClick={() => {
              setName(settings.instituteName);
              setEmoji(settings.logoEmoji);
              setError("");
            }}
          >
            Reset
          </Button>
          <Button type="submit" disabled={!dirty}>
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ListEditor({
  label,
  placeholder,
  items,
  usage,
  onAdd,
  onRemove,
}: {
  label: string;
  placeholder: string;
  items: string[];
  /** Number of students using an item (shown as a badge). */
  usage: (item: string) => number;
  /** Data-layer helpers; they throw a user-facing message when not allowed. */
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const id = label.toLowerCase().replace(/\W+/g, "-");

  function add(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    try {
      onAdd(v);
      setValue("");
      toast.success(`Added "${v}"`, "A Section A was created for each new class. Build its timetable below.");
    } catch (err) {
      setError(errMsg(err));
    }
  }

  function remove(item: string) {
    try {
      onRemove(item);
      toast.success(`Removed "${item}"`, "Its empty sections were removed too.");
    } catch (err) {
      toast.error(`Can't remove "${item}"`, errMsg(err));
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-700">{label}</p>
      <ul className="mb-3 flex flex-wrap gap-2">
        {items.map((item) => {
          const used = usage(item);
          return (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1 pr-1 pl-3 text-sm text-slate-700"
            >
              {item}
              <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500 tabular-nums" title={`${used} students`}>
                {used}
              </span>
              <button
                type="button"
                onClick={() => remove(item)}
                aria-label={`Remove ${item}`}
                className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <XIcon width={14} height={14} />
              </button>
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          New {label.toLowerCase()}
        </label>
        <input
          id={id}
          className={cn(inputClass, error && "border-red-400")}
          placeholder={placeholder}
          value={value}
          maxLength={30}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
        />
        <Button type="submit" variant="secondary">
          <PlusIcon width={16} height={16} /> Add
        </Button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DataAction({
  title,
  text,
  danger,
  children,
}: {
  title: string;
  text: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col rounded-xl border p-4", danger ? "border-red-200 bg-red-50/40" : "border-slate-200")}>
      <p className={cn("text-sm font-semibold", danger ? "text-red-700" : "text-slate-900")}>{title}</p>
      <p className="mt-1 flex-1 text-sm text-slate-500">{text}</p>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function AccountCard({ user }: { user: User }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");
  const usingDefault = user.password === DEFAULT_PRINCIPAL_PASSWORD;

  const errors = {
    current: !current ? "Enter your current password." : serverError,
    next: next.length < 4 ? "New password must be at least 4 characters." : next === current ? "Choose a different password." : "",
    confirm: confirm !== next ? "Passwords do not match." : "",
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!current || errors.next || errors.confirm) return;
    try {
      changeOwnPassword(user.id, current, next);
      toast.success("Password changed", "Use your new password the next time you sign in.");
      setCurrent("");
      setNext("");
      setConfirm("");
      setSubmitted(false);
      setServerError("");
    } catch (err) {
      setServerError(errMsg(err));
    }
  }

  return (
    <Card>
      <div id="my-account" className="scroll-mt-24" />
      <CardHeader title="My Account" subtitle={`Signed in as ${user.name} (@${user.username}) · ${user.role}`} />
      <form onSubmit={handleSubmit} noValidate className="space-y-4 p-5">
        {usingDefault && (
          <div className="flex gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
            You are still using the default password. Change it now so only you can sign in as principal.
          </div>
        )}
        <Field label="Current password" htmlFor="acc-current" required error={show("current")}>
          <input
            id="acc-current"
            type="password"
            autoComplete="current-password"
            className={cn(inputClass, show("current") && "border-red-400")}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setServerError("");
            }}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="New password" htmlFor="acc-new" required error={show("next")} hint="At least 4 characters.">
            <input
              id="acc-new"
              type="password"
              autoComplete="new-password"
              className={cn(inputClass, show("next") && "border-red-400")}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="acc-confirm" required error={show("confirm")}>
            <input
              id="acc-confirm"
              type="password"
              autoComplete="new-password"
              className={cn(inputClass, show("confirm") && "border-red-400")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button type="submit">
            <KeyIcon width={16} height={16} /> Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
