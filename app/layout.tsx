import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { InlineScript } from "@/components/InlineScript";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Institute Attendance", template: "%s · Institute Attendance" },
  description: "Track student attendance, classes and reports for your institute.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data-theme before paint, so the attribute differs from the server's.
    <html lang="en" data-theme="light" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <InlineScript html={THEME_SCRIPT} />
      </head>
      {/* Browser extensions (e.g. ColorZilla) inject attributes on <body> before hydration. */}
      <body className="min-h-full font-sans" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
