import type { Metadata } from "next";
import { TeachersView } from "@/components/views/TeachersView";

export const metadata: Metadata = { title: "Teachers" };

export default function TeachersPage() {
  return <TeachersView />;
}
