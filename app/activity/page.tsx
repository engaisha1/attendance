import type { Metadata } from "next";
import { ActivityView } from "@/components/views/ActivityView";

export const metadata: Metadata = { title: "Activity Log" };

export default function ActivityPage() {
  return <ActivityView />;
}
