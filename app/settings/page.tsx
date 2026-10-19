import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { SettingsView } from "@/components/views/SettingsView";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  // The timetable manager reads ?section= (useSearchParams) to open a linked section.
  return (
    <Suspense fallback={<PageLoading />}>
      <SettingsView />
    </Suspense>
  );
}
