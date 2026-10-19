"use client";

import { useState, type ReactNode } from "react";
import { useAppData, useDebounced } from "@/lib/hooks";
import type { ActivityCategory, ActivityEntry } from "@/lib/types";
import { cn, formatDateLong, formatDateTime, relativeTime, toISODate } from "@/lib/utils";
import { SkeletonRows } from "../Polish";
import { ActivityIcon, CalendarIcon, ClipboardIcon, DatabaseIcon, FilterIcon, KeyIcon, SearchIcon, SettingsIcon, TeacherIcon, UsersIcon } from "../icons";
import { Button, ButtonLink, Card, EmptyState, PageLoading, Select, inputClass } from "../ui";

const PAGE_SIZE = 50;

const CATEGORY_META: Record<ActivityCategory, { label: string; icon: ReactNode; tone: string }> = {
  student: { label: "Students", icon: <UsersIcon width={16} height={16} />, tone: "bg-indigo-50 text-indigo-600" },
  attendance: { label: "Attendance", icon: <ClipboardIcon width={16} height={16} />, tone: "bg-emerald-50 text-emerald-600" },
  teacher: { label: "Teachers", icon: <TeacherIcon width={16} height={16} />, tone: "bg-violet-100 text-violet-600" },
  class: { label: "Subjects & timetables", icon: <CalendarIcon width={16} height={16} />, tone: "bg-amber-50 text-amber-600" },
  settings: { label: "Settings", icon: <SettingsIcon width={16} height={16} />, tone: "bg-slate-100 text-slate-600" },
  data: { label: "Data & backups", icon: <DatabaseIcon width={16} height={16} />, tone: "bg-slate-100 text-slate-600" },
  auth: { label: "Sign-ins", icon: <KeyIcon width={16} height={16} />, tone: "bg-slate-100 text-slate-600" },
};

export function ActivityView() {
  const { activity, ready } = useAppData();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 250);
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  if (!ready) return <PageLoading />;

  const q = debounced.trim().toLowerCase();
  const filtered = activity.filter(
    (e) =>
      (category === "all" || e.category === category) &&
      (!q || `${e.action} ${e.summary} ${e.actorName}`.toLowerCase().includes(q)),
  );
  const filtering = query !== debounced;
  const shown = filtered.slice(0, limit);

  // Group consecutive entries by local day for readable headings.
  const groups: { day: string; entries: ActivityEntry[] }[] = [];
  for (const e of shown) {
    const day = toISODate(new Date(e.at));
    const last = groups[groups.length - 1];
    if (last?.day === day) last.entries.push(e);
    else groups.push({ day, entries: [e] });
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" width={16} height={16} />
            <input
              type="search"
              aria-label="Search activity"
              placeholder="Search actions, names, classes or people…"
              className={cn(inputClass, "pl-9")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </div>
          <Select
            aria-label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ActivityCategory | "all");
              setLimit(PAGE_SIZE);
            }}
            options={[
              { value: "all", label: "All activity" },
              ...(Object.keys(CATEGORY_META) as ActivityCategory[]).map((c) => ({ value: c, label: CATEGORY_META[c].label })),
            ]}
          />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {activity.length} event{activity.length === 1 ? "" : "s"} recorded · newest first · the latest 2,000 are kept
        </p>
      </Card>

      <Card>
        {filtering ? (
          <SkeletonRows rows={6} columns={3} />
        ) : activity.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={<ActivityIcon />}
            title="No activity yet"
            hint="Actions such as adding students, saving attendance or changing settings appear here."
            action={
              <ButtonLink href="/students" variant="secondary">
                <UsersIcon width={16} height={16} /> Go to Students
              </ButtonLink>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FilterIcon />}
            title="Nothing matches"
            hint="Try another search term or category."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div>
            {groups.map((g) => (
              <section key={g.day}>
                <h3 className="sticky top-16 z-[1] border-b border-slate-100 bg-slate-50/95 px-5 py-2 text-xs font-semibold text-slate-500 backdrop-blur">
                  {formatDateLong(g.day)}
                </h3>
                <ul className="divide-y divide-slate-100">
                  {g.entries.map((e) => {
                    const meta = CATEGORY_META[e.category];
                    return (
                      <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.tone)}>{meta.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-900">
                            <span className="font-semibold">{e.action}</span>
                            {e.summary && <span className="text-slate-600"> — {e.summary}</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            by <span className="font-medium text-slate-600">{e.actorName}</span> · {meta.label}
                          </p>
                        </div>
                        <time dateTime={e.at} title={formatDateTime(e.at)} className="shrink-0 text-xs whitespace-nowrap text-slate-400">
                          {relativeTime(e.at)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {filtered.length > limit && (
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
                <p className="text-xs text-slate-400">
                  Showing {limit} of {filtered.length}
                </p>
                <Button variant="secondary" size="sm" onClick={() => setLimit(limit + PAGE_SIZE)}>
                  Show more
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
