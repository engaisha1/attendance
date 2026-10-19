"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppData, useCurrentUser } from "@/lib/hooks";
import { dismissSessionNotice, dismissUpgradeNotice, logout } from "@/lib/storage";
import type { Role, User } from "@/lib/types";
import { toggleTheme, useTheme } from "@/lib/theme";
import { cn, formatDateLong, todayISO } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";
import { ConfirmModal, Modal } from "./Modal";
import { GuardedLink, NavGuardProvider, useNavGuard } from "./NavGuard";
import { StudentFormModal } from "./StudentFormModal";
import { ToastProvider, useToast } from "./Toast";
import {
  ActivityIcon,
  AlertIcon,
  CalendarIcon,
  ChartIcon,
  ClipboardIcon,
  DashboardIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  TeacherIcon,
  UsersIcon,
  XIcon,
} from "./icons";
import { Button, ButtonLink } from "./ui";

const NAV: { href: string; label: string; icon: typeof DashboardIcon; subtitle: string; roles: Role[] }[] = [
  { href: "/", label: "Dashboard", icon: DashboardIcon, subtitle: "Overview of today and the last 7 days", roles: ["principal"] },
  { href: "/students", label: "Students", icon: UsersIcon, subtitle: "Manage enrolled students", roles: ["principal"] },
  { href: "/teachers", label: "Teachers", icon: TeacherIcon, subtitle: "Teacher accounts and class assignments", roles: ["principal"] },
  {
    href: "/attendance",
    label: "Take Attendance",
    icon: ClipboardIcon,
    subtitle: "Mark a class for a given day",
    roles: ["principal", "teacher"],
  },
  { href: "/reports", label: "Reports", icon: ChartIcon, subtitle: "Analyse and export attendance", roles: ["principal"] },
  { href: "/activity", label: "Activity Log", icon: ActivityIcon, subtitle: "Who did what, and when", roles: ["principal"] },
  { href: "/settings", label: "Settings", icon: SettingsIcon, subtitle: "Institute, classes, data and account", roles: ["principal"] },
];

const LOGIN_PATH = "/login";
const TEACHER_HOME = "/attendance";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function homeFor(user: User): string {
  return user.role === "principal" ? "/" : TEACHER_HOME;
}

/** Whether a role may open a path. Teachers only get the attendance page. */
function canOpen(role: Role, pathname: string): boolean {
  return role === "principal" || isActive(pathname, TEACHER_HOME);
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <NavGuardProvider>
        <AuthGate>{children}</AuthGate>
      </NavGuardProvider>
    </ToastProvider>
  );
}

/** Client-side route guard: sends signed-out users to /login and keeps teachers on their page. */
function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useCurrentUser();
  const deniedPath = useRef<string | null>(null);
  const isLogin = pathname === LOGIN_PATH;

  const allowed = ready && (user ? !isLogin && canOpen(user.role, pathname) : isLogin);

  useEffect(() => {
    if (!ready || allowed) return;
    if (!user) {
      router.replace(LOGIN_PATH);
    } else if (isLogin) {
      router.replace(homeFor(user));
    } else {
      // A teacher opened a page they can't use. "/" is just their home, so no warning there.
      if (pathname !== "/" && deniedPath.current !== pathname) {
        deniedPath.current = pathname;
        toast.error("You do not have permission to open that page.");
      }
      router.replace(TEACHER_HOME);
    }
  }, [ready, allowed, user, isLogin, pathname, router, toast]);

  useEffect(() => {
    if (allowed) deniedPath.current = null;
  }, [allowed]);

  if (!allowed) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-slate-50" aria-busy="true">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        </div>
        {/* Keep the page segment in the tree (hidden) so Next's server render and instant-navigation
            validation still see it; pages render only their loading state until the session is known. */}
        {!ready && <div hidden>{children}</div>}
      </>
    );
  }
  if (isLogin || !user) return <>{children}</>;
  return <Shell user={user}>{children}</Shell>;
}

function Shell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const toast = useToast();
  const { session, flags } = useAppData();
  const [menuOpen, setMenuOpen] = useState(false);
  const { hasPending, blocker, confirmNavigation, cancelNavigation, runGuarded } = useNavGuard();
  const nav = NAV.filter((n) => n.roles.includes(user.role));
  const current = nav.find((n) => isActive(pathname, n.href)) ?? nav[0];
  const theme = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);

  // Ctrl+K / ⌘K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signOut = () =>
    runGuarded(() => {
      setMenuOpen(false);
      logout();
      toast.info("Signed out", "See you next time.");
    });

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block print:hidden">
        <SidebarContent pathname={pathname} nav={nav} user={user} onSignOut={signOut} />
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <div className="fade-in absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <aside className="slide-in-left absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <XIcon />
            </button>
            <SidebarContent
              pathname={pathname}
              nav={nav}
              user={user}
              onSignOut={signOut}
              onNavigate={() => setMenuOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur print:static print:border-0">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="-ml-1 rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden print:hidden"
            >
              <MenuIcon />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">{current.label}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {user.role === "teacher" ? "Your assigned classes" : current.subtitle}
              </p>
            </div>
            <TodayChip />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search (Ctrl+K)"
              title="Search (Ctrl+K)"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 md:px-3 md:py-1.5 print:hidden"
            >
              <SearchIcon width={16} height={16} />
              <span className="hidden text-xs md:inline">Search</span>
              <kbd className="hidden rounded border border-slate-200 px-1 text-[10px] font-medium text-slate-400 xl:inline">Ctrl K</kbd>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600 print:hidden"
            >
              {theme === "dark" ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
            </button>
            <button
              type="button"
              onClick={signOut}
              title={`Sign out ${user.name}`}
              aria-label="Sign out"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pr-1 pl-1 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 sm:pr-3 print:hidden"
            >
              <Avatar name={user.name} small />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* Re-keyed per page so each navigation fades in. */}
          <div key={pathname} className="page-in">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        user={user}
        nav={nav}
        onAddStudent={() => setAddingStudent(true)}
      />
      {addingStudent && <StudentFormModal onClose={() => setAddingStudent(false)} />}

      <ConfirmModal
        open={hasPending}
        title="Leave without saving?"
        message={blocker ?? "You have unsaved changes."}
        confirmLabel="Discard & leave"
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />

      <Modal
        open={session?.notice === "default-password"}
        onClose={dismissSessionNotice}
        title="Change the default password"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={dismissSessionNotice}>
              Later
            </Button>
            <ButtonLink href="/settings#my-account" onClick={dismissSessionNotice} data-autofocus>
              Change password now
            </ButtonLink>
          </>
        }
      >
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertIcon />
          </span>
          <p className="pt-1 text-sm leading-relaxed text-slate-600">
            You signed in with the default principal account (<strong className="text-slate-900">principal</strong> /{" "}
            <strong className="text-slate-900">admin123</strong>). Anyone who knows it can open the platform, so please change
            it in <strong className="text-slate-900">Settings → My Account</strong>. This notice is shown only once.
          </p>
        </div>
      </Modal>

      {/* One-time notice after the subjects/sections upgrade (principal only, after the password notice). */}
      <Modal
        open={user.role === "principal" && !!flags.upgradeNotice && session?.notice !== "default-password"}
        onClose={dismissUpgradeNotice}
        title="Upgraded to subjects, sections & timetables"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={dismissUpgradeNotice}>
              Got it
            </Button>
            <ButtonLink href="/settings#timetable" onClick={dismissUpgradeNotice} data-autofocus>
              Set up timetables
            </ButtonLink>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-relaxed text-slate-600">
          <p>
            Attendance is now taken per <strong className="text-slate-900">subject session</strong> (class section + subject), so{" "}
            <strong className="text-slate-900">attendance history starts fresh</strong> from today.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              {flags.upgradeNotice?.archivedRecords ?? 0} earlier attendance record
              {flags.upgradeNotice?.archivedRecords === 1 ? " was" : "s were"} moved to an archive — nothing was deleted. You can
              download it from Settings → Data.
            </li>
            <li>All students were kept and placed in Section A of their class.</li>
            {(flags.upgradeNotice?.resetTeachers ?? 0) > 0 && (
              <li>
                {flags.upgradeNotice?.resetTeachers} teacher
                {flags.upgradeNotice?.resetTeachers === 1 ? " needs" : "s need"} new subject assignments on the Teachers page.
              </li>
            )}
            <li>Build each section&apos;s weekly timetable in Settings → Classes &amp; Timetable.</li>
          </ul>
          <p className="text-xs text-slate-400">This notice is shown only once.</p>
        </div>
      </Modal>
    </div>
  );
}

export function Avatar({ name, small }: { name: string; small?: boolean }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white",
        small ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs",
      )}
    >
      {letters}
    </span>
  );
}

function TodayChip() {
  return (
    <span className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
      <CalendarIcon width={14} height={14} className="text-indigo-500" />
      <span className="hidden md:inline">{formatDateLong(todayISO())}</span>
      <span className="md:hidden">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
    </span>
  );
}

function SidebarContent({
  pathname,
  nav,
  user,
  onSignOut,
  onNavigate,
}: {
  pathname: string;
  nav: typeof NAV;
  user: User;
  onSignOut: () => void;
  onNavigate?: () => void;
}) {
  const { settings, students } = useAppData();
  const activeCount = students.filter((s) => s.status === "active").length;
  return (
    <div className="flex h-full flex-col">
      <GuardedLink href={homeFor(user)} onClick={onNavigate} className="flex h-16 items-center gap-3 border-b border-slate-100 px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl">{settings.logoEmoji}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{settings.instituteName}</span>
          <span className="block text-xs text-slate-400">Attendance platform</span>
        </span>
      </GuardedLink>
      <nav className="flex-1 space-y-1 p-3" aria-label="Main">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <GuardedLink
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon className={active ? "text-indigo-600" : "text-slate-400"} />
              {label}
            </GuardedLink>
          );
        })}
      </nav>
      {user.role === "principal" && (
        <p className="px-5 pb-2 text-xs text-slate-400">
          <span className="font-medium text-slate-600">{activeCount}</span> active student{activeCount === 1 ? "" : "s"} · stored in
          this browser
        </p>
      )}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-[10px] p-2">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-400 capitalize">
              {user.role} · @{user.username}
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogoutIcon width={18} height={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
