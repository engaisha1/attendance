import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { AttendanceView } from "@/components/views/AttendanceView";

export const metadata: Metadata = { title: "Take Attendance" };

export default function AttendancePage() {
  // AttendanceView reads the selected class from the URL (useSearchParams).
  return (
    <Suspense fallback={<PageLoading />}>
      <AttendanceView />
    </Suspense>
  );
}
