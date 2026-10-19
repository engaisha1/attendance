"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertIcon, CheckCircleIcon, InfoIcon, XIcon } from "./icons";

type ToastKind = "success" | "error" | "info";

export interface ToastOptions {
  /** e.g. { label: "Undo", onClick } — clicking runs it and closes the toast. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds; defaults to 4s (6s for errors). */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  duration: number;
}

interface ToastApi {
  success: (title: string, description?: string, options?: ToastOptions) => void;
  error: (title: string, description?: string, options?: ToastOptions) => void;
  info: (title: string, description?: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const KIND_STYLES: Record<ToastKind, { icon: ReactNode; accent: string; bar: string }> = {
  success: { icon: <CheckCircleIcon className="text-emerald-600" />, accent: "border-l-emerald-500", bar: "bg-emerald-500" },
  error: { icon: <AlertIcon className="text-red-600" />, accent: "border-l-red-500", bar: "bg-red-500" },
  info: { icon: <InfoIcon className="text-indigo-600" />, accent: "border-l-indigo-500", bar: "bg-indigo-500" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, title: string, description?: string, options?: ToastOptions) => {
      const id = nextId.current++;
      const duration = options?.duration ?? (kind === "error" ? 6000 : 4000);
      setToasts((list) => [...list.slice(-3), { id, kind, title, description, duration, action: options?.action }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d, o) => push("success", t, d, o),
      error: (t, d, o) => push("error", t, d, o),
      info: (t, d, o) => push("info", t, d, o),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end print:hidden"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "toast-in pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white p-3.5 shadow-lg",
              KIND_STYLES[t.kind].accent,
            )}
          >
            <span className="mt-0.5 shrink-0">{KIND_STYLES[t.kind].icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-slate-500">{t.description}</p>}
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.onClick();
                }}
                className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <XIcon width={14} height={14} />
            </button>
            {t.action && (
              <span
                aria-hidden
                className={cn("toast-timer absolute bottom-0 left-0 h-0.5 w-full opacity-60", KIND_STYLES[t.kind].bar)}
                style={{ animationDuration: `${t.duration}ms` }}
              />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
