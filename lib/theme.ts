"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Follow the OS setting until the user picks a theme explicitly.
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (!storedTheme()) apply(systemTheme());
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(fn);
    mq.removeEventListener("change", onSystem);
  };
}

function current(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Still switch for this page view.
  }
  apply(theme);
}

export function toggleTheme() {
  setTheme(current() === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "light");
}
