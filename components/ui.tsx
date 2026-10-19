"use client";

import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import type { AttendanceStatus, StudentStatus } from "@/lib/types";
import { STATUS_META, cn } from "@/lib/utils";
import { GuardedLink } from "./NavGuard";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus-visible:ring-indigo-500",
  secondary: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-2.5 text-xs",
  md: "h-10 gap-2 rounded-[10px] px-4 text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  "data-autofocus"?: boolean;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof GuardedLink> & { variant?: Variant; size?: Size }) {
  return <GuardedLink className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-[14px] border border-slate-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "indigo",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ReactNode;
  tone?: "indigo" | "emerald" | "amber" | "red" | "slate";
}) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <Card className="p-4 transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tones[tone])}>{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", m.badge)}>
      {m.label}
    </span>
  );
}

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        status === "active" ? "bg-indigo-50 text-indigo-700 ring-indigo-600/20" : "bg-slate-100 text-slate-500 ring-slate-500/20",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "active" ? "bg-indigo-500" : "bg-slate-400")} />
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50 disabled:text-slate-400";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}

export function Select({
  options,
  className,
  ...props
}: Omit<ComponentProps<"select">, "children"> & { options: { value: string; label: string }[] }) {
  return (
    <select className={cn(inputClass, "cursor-pointer pr-8", className)} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-[14px] bg-slate-200/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[14px] bg-slate-200/60" />
    </div>
  );
}

export function RateBar({ rate }: { rate: number | null }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          rate === null ? "" : rate >= 90 ? "bg-emerald-500" : rate >= 75 ? "bg-amber-400" : "bg-red-500",
        )}
        style={{ width: `${rate ?? 0}%` }}
      />
    </div>
  );
}
