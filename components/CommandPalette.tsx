"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { downloadBackup, exportAttendanceCSV } from "@/lib/actions";
import { useAppData } from "@/lib/hooks";
import { toggleTheme, useTheme } from "@/lib/theme";
import type { User } from "@/lib/types";
import { cn, normalizePhone, sectionShort, todayISO } from "@/lib/utils";
import { useNavGuard } from "./NavGuard";
import { useToast } from "./Toast";
import {
  ClipboardIcon,
  CornerDownLeftIcon,
  DatabaseIcon,
  DownloadIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  UsersIcon,
} from "./icons";

export interface PaletteNavItem {
  href: string;
  label: string;
  icon: (p: { width?: number; height?: number }) => ReactNode;
}

interface Item {
  id: string;
  group: "Students" | "Sessions" | "Actions" | "Pages";
  label: string;
  hint?: string;
  icon: ReactNode;
  /** Extra text to match against (e.g. phone digits). */
  keywords?: string;
  run: () => void;
}

/**
 * Fuzzy score: contiguous matches and word starts score highest; any in-order
 * subsequence still matches. -1 means no match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx !== -1) return 1000 - idx * 2 + (idx === 0 || t[idx - 1] === " " ? 200 : 0);
  let score = 0;
  let ti = 0;
  let streak = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 10 + streak * 5 - Math.min(found - ti, 10);
    ti = found + 1;
  }
  return score;
}

interface Props {
  open: boolean;
  onClose: () => void;
  user: User;
  nav: PaletteNavItem[];
  onAddStudent: () => void;
}

export function CommandPalette({ open, onClose, user, nav, onAddStudent }: Props) {
  if (!open) return null;
  return createPortal(<PaletteDialog onClose={onClose} user={user} nav={nav} onAddStudent={onAddStudent} />, document.body);
}

function PaletteDialog({ onClose, user, nav, onAddStudent }: Omit<Props, "open">) {
  const { students, attendance, sections, subjects } = useAppData();
  const { requestNavigation } = useNavGuard();
  const toast = useToast();
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const isPrincipal = user.role === "principal";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => requestNavigation(href);
    const pages: Item[] = nav.map((n) => ({
      id: `page:${n.href}`,
      group: "Pages",
      label: n.label,
      hint: "Go to page",
      icon: <n.icon width={16} height={16} />,
      run: go(n.href),
    }));
    const actions: Item[] = [
      { id: "act:attendance", group: "Actions", label: "Take Attendance", icon: <ClipboardIcon width={16} height={16} />, run: go("/attendance") },
      ...(isPrincipal
        ? [
            { id: "act:add", group: "Actions", label: "Add Student", icon: <PlusIcon width={16} height={16} />, run: onAddStudent },
            {
              id: "act:csv",
              group: "Actions",
              label: "Export CSV",
              hint: "All attendance records",
              icon: <DownloadIcon width={16} height={16} />,
              run: () => {
                if (attendance.length === 0) {
                  toast.info("Nothing to export yet", "Save some attendance first.");
                  return;
                }
                const name = exportAttendanceCSV(
                  [...attendance].sort((a, b) => b.date.localeCompare(a.date)),
                  `attendance_all_${todayISO()}.csv`,
                );
                toast.success("CSV exported", `${attendance.length} records · ${name}`);
              },
            },
            {
              id: "act:backup",
              group: "Actions",
              label: "Download Backup",
              hint: "JSON of all data",
              icon: <DatabaseIcon width={16} height={16} />,
              run: () => toast.success("Backup downloaded", downloadBackup()),
            },
          ] satisfies Item[]
        : []),
      {
        id: "act:theme",
        group: "Actions",
        label: "Toggle Dark Mode",
        hint: theme === "dark" ? "Switch to light" : "Switch to dark",
        icon: theme === "dark" ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />,
        run: toggleTheme,
      },
    ];
    const studentItems: Item[] = isPrincipal
      ? students.map((s) => ({
          id: `student:${s.id}`,
          group: "Students",
          label: s.fullName,
          hint: `${s.phone} · ${sectionShort(s)}`,
          keywords: normalizePhone(s.phone),
          icon: <UsersIcon width={16} height={16} />,
          run: go(`/students?view=${s.id}`),
        }))
      : [];
    const sessionItems: Item[] = isPrincipal
      ? []
      : user.assignedSessions.flatMap((a) => {
          const cs = sections.find((s) => s.id === a.classSectionId);
          const sub = subjects.find((s) => s.id === a.subjectId);
          if (!cs || !sub) return [];
          return [
            {
              id: `session:${a.classSectionId}:${a.subjectId}`,
              group: "Sessions",
              label: `${sub.name} · ${sectionShort(cs)}`,
              hint: "Open session",
              icon: <ClipboardIcon width={16} height={16} />,
              run: go(`/attendance?section=${cs.id}&subject=${sub.id}`),
            },
          ];
        });
    return [...studentItems, ...sessionItems, ...actions, ...pages];
  }, [nav, isPrincipal, students, attendance, sections, subjects, user, theme, onAddStudent, toast, requestNavigation]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return items.filter((i) => i.group !== "Students");
    const digits = normalizePhone(q).replace(/\D/g, "");
    return items
      .map((item) => {
        let score = Math.max(fuzzyScore(q, item.label), item.hint ? fuzzyScore(q, item.hint) - 300 : -1);
        if (digits.length >= 3 && item.keywords?.includes(digits)) score = Math.max(score, 900);
        return { item, score };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((r) => r.item);
  }, [items, query]);

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function run(item: Item | undefined) {
    if (!item) return;
    onClose();
    item.run();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((activeIndex - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[12vh] print:hidden" onKeyDown={onKeyDown}>
      <div className="fade-in absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="pop-in relative w-full max-w-xl overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <SearchIcon className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-label="Search students, pages and actions"
            placeholder={isPrincipal ? "Search students, pages, actions…" : "Search your sessions and actions…"}
            className="h-14 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <kbd className="hidden shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 sm:block">Esc</kbd>
        </div>
        <ul ref={listRef} id={listId} role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-slate-500">
              No results for “{query}”. Try a name, phone number or page.
            </li>
          )}
          {results.map((item, i) => {
            const header = i === 0 || results[i - 1].group !== item.group ? item.group : null;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{header}</p>}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  data-index={i}
                  onMouseMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => run(item)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors",
                    i === activeIndex ? "bg-indigo-50 text-indigo-700" : "text-slate-700",
                  )}
                >
                  <span className={cn("shrink-0", i === activeIndex ? "text-indigo-600" : "text-slate-400")}>{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.label}</span>
                    {item.hint && <span className="block truncate text-xs text-slate-400">{item.hint}</span>}
                  </span>
                  {i === activeIndex && <CornerDownLeftIcon width={14} height={14} className="shrink-0 text-indigo-500" />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          <span>
            <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-sans">↵</kbd> select
          </span>
          <span>
            <kbd className="font-sans">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
