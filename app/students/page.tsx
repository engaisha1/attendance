import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui";
import { StudentsView } from "@/components/views/StudentsView";

export const metadata: Metadata = { title: "Students" };

export default function StudentsPage() {
  // StudentsView reads ?view=<id> (useSearchParams) to open a profile from a link.
  return (
    <Suspense fallback={<PageLoading />}>
      <StudentsView />
    </Suspense>
  );
}
