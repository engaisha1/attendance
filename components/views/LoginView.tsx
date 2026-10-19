"use client";

import { useState, type FormEvent } from "react";
import { useAppData } from "@/lib/hooks";
import { DEFAULT_PRINCIPAL_ID, DEFAULT_PRINCIPAL_PASSWORD, login } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useToast } from "../Toast";
import { AlertIcon, EyeIcon, EyeOffIcon, LockIcon, UserIcon } from "../icons";
import { Button, inputClass } from "../ui";

export function LoginView() {
  const { settings, users, ready } = useAppData();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Only on a brand-new install, before the seeded principal's password has been changed.
  const firstRun =
    users.length === 1 && users[0].id === DEFAULT_PRINCIPAL_ID && users[0].password === DEFAULT_PRINCIPAL_PASSWORD;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    try {
      const user = login(username, password);
      toast.success(`Welcome, ${user.name}`, user.role === "teacher" ? "Pick a class to take attendance." : undefined);
      // AuthGate redirects to the right home page once the session exists.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPassword("");
    }
  }

  // Real institute name/logo only exist in the browser; avoid flashing the defaults.
  if (!ready) return <div className="min-h-screen bg-slate-50" aria-busy="true" />;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-indigo-50 via-white to-violet-100 dark:via-slate-50 px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-300/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-violet-300/30 blur-3xl" />

      <div className="pop-in relative w-full max-w-sm">
        <div className="rounded-[20px] border border-white/60 bg-white/90 p-7 shadow-[0_20px_60px_-15px_rgba(79,70,229,0.35)] backdrop-blur sm:p-8">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 to-violet-500 text-3xl shadow-lg shadow-indigo-500/30">
              {settings.logoEmoji}
            </span>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{settings.instituteName}</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to the attendance platform</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            <div>
              <label htmlFor="login-username" className="mb-1.5 block text-xs font-medium text-slate-700">
                Username
              </label>
              <div className="relative">
                <UserIcon width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-username"
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={cn(inputClass, "h-11 pl-9", error && "border-red-300")}
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError("");
                  }}
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <LockIcon width={16} height={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={cn(inputClass, "h-11 pr-10 pl-9", error && "border-red-300")}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  {showPassword ? <EyeOffIcon width={16} height={16} /> : <EyeIcon width={16} height={16} />}
                </button>
              </div>
            </div>
            <Button type="submit" className="h-11 w-full">
              Sign in
            </Button>
          </form>

          {firstRun && (
            <p className="mt-5 rounded-[10px] bg-indigo-50 px-3 py-2.5 text-center text-xs text-indigo-700">
              First time here? Sign in as <strong>principal</strong> with password <strong>admin123</strong>, then change it.
            </p>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">Forgot your password? Ask your principal to reset it.</p>
      </div>
    </div>
  );
}
