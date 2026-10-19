"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getCurrentUser, getData, getServerData, subscribe } from "./storage";
import type { StoreState, User } from "./types";

const noopSubscribe = () => () => {};

/** False during server render and hydration, true once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Live app data from the data layer; re-renders on every change (including other tabs). */
export function useAppData(): StoreState & { ready: boolean } {
  const data = useSyncExternalStore(subscribe, getData, getServerData);
  const ready = useHydrated();
  return { ...data, ready };
}

/** The signed-in user (null when signed out or before hydration). */
export function useCurrentUser(): { user: User | null; ready: boolean } {
  const { users, session, ready } = useAppData();
  return { user: ready ? getCurrentUser({ users, session }) : null, ready };
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
