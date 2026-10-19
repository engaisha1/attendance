"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ComponentProps, type ReactNode } from "react";

/**
 * Lets a page block in-app navigation (and actions like signing out) while it
 * has unsaved changes. The confirmation prompt itself is rendered by AppShell.
 */
interface NavGuardApi {
  blocker: string | null;
  setBlocker: (message: string | null) => void;
  hasPending: boolean;
  requestNavigation: (href: string) => void;
  /** Runs `action` now, or after the user confirms discarding unsaved changes. */
  runGuarded: (action: () => void) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
}

const NavGuardContext = createContext<NavGuardApi | null>(null);

export function useNavGuard(): NavGuardApi {
  const ctx = useContext(NavGuardContext);
  if (!ctx) throw new Error("useNavGuard must be used inside <NavGuardProvider>");
  return ctx;
}

export function NavGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [blocker, setBlocker] = useState<string | null>(null);
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  const runGuarded = useCallback(
    (action: () => void) => {
      if (blocker) setPending({ run: action });
      else action();
    },
    [blocker],
  );

  const requestNavigation = useCallback((href: string) => runGuarded(() => router.push(href)), [runGuarded, router]);

  const confirmNavigation = useCallback(() => {
    if (!pending) return;
    setBlocker(null);
    setPending(null);
    pending.run();
  }, [pending]);

  const cancelNavigation = useCallback(() => setPending(null), []);

  const api = useMemo(
    () => ({
      blocker,
      setBlocker,
      hasPending: pending !== null,
      requestNavigation,
      runGuarded,
      confirmNavigation,
      cancelNavigation,
    }),
    [blocker, pending, requestNavigation, runGuarded, confirmNavigation, cancelNavigation],
  );

  return <NavGuardContext.Provider value={api}>{children}</NavGuardContext.Provider>;
}

/** next/link that asks for confirmation when the current page has unsaved changes. */
export function GuardedLink({ href, onNavigate, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { blocker, requestNavigation } = useNavGuard();
  return (
    <Link
      href={href}
      onNavigate={(e) => {
        onNavigate?.(e);
        if (blocker) {
          e.preventDefault();
          requestNavigation(href);
        }
      }}
      {...props}
    />
  );
}
